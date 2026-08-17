import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { checkOfficialDocs, renderDocsCheckReport } from './docs-check.ts'

/** One check item's verdict. `fail` blocks publish readiness; `warn` does not. */
export type CheckStatus = 'pass' | 'fail' | 'warn'

/** Verdict for one audit item. */
export interface CheckResult {
  readonly id: string
  readonly file: string
  readonly item: string
  readonly status: CheckStatus
  readonly detail: string
  readonly fix?: string
}

/** Complete audit of one plugin repository. */
export interface ReviewReport {
  readonly root: string
  readonly checkedAt: string
  readonly checks: CheckResult[]
  /** Whether no `fail` check exists. */
  readonly ready: boolean
  /** ids of every failing check. */
  readonly failing: string[]
}

/** Read a JSON file, returning the parsed value or an error description. */
async function readJson(path: string): Promise<{ value: Record<string, unknown> | null; error?: string }> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch {
    return { value: null, error: '文件不存在或不可读' }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { value: null, error: '不是 JSON 对象' }
    }
    return { value: parsed as Record<string, unknown> }
  } catch {
    return { value: null, error: 'JSON 解析失败' }
  }
}

/** Read a text file's content, returning undefined when absent or unreadable. */
async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

/** Whether a value is a non-empty string. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Whether a string uses a semver range operator (not an exact pin). */
function isRange(value: string): boolean {
  return /[><^~*|x]/.test(value) || value.endsWith('.x')
}

/** Whether a package entry points into lib/ (accepts leading `./`). */
function leadsToLib(value: string): boolean {
  return value.startsWith('./lib/') || value.startsWith('lib/')
}

/** Remove JS line and block comments so config checks ignore prose. */
function stripJsComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

/**
 * Statically audit one plugin repository against the hand-encoded rule set
 * from the dsh-plugin-skeleton skill and the official plugin-dev docs. Every
 * check is a pure function of the files under `root`.
 * @param root - absolute path of the target plugin repository.
 * @returns the full audit report.
 */
export async function auditPluginRepo(root: string): Promise<ReviewReport> {
  const checks: CheckResult[] = []
  const fail = (id: string, file: string, item: string, detail: string, fix?: string): void => {
    checks.push({ id, file, item, status: 'fail', detail, fix })
  }
  const warn = (id: string, file: string, item: string, detail: string, fix?: string): void => {
    checks.push({ id, file, item, status: 'warn', detail, fix })
  }
  const pass = (id: string, file: string, item: string, detail: string): void => {
    checks.push({ id, file, item, status: 'pass', detail })
  }

  // --- package.json -----------------------------------------------------
  const pkg = await readJson(join(root, 'package.json'))
  if (pkg.value === null) {
    fail('pkg.missing', 'package.json', 'package.json 存在', pkg.error ?? '无法读取', '在仓库根添加 package.json')
  } else {
    const p = pkg.value
    if (isNonEmptyString(p.name) && isNonEmptyString(p.version)) {
      pass('pkg.name-version', 'package.json', 'name / version 齐全', `${p.name}@${p.version}`)
    } else {
      fail('pkg.name-version', 'package.json', 'name / version 齐全', '缺少 name 或 version', '补全 name（@scope/name）与 version')
    }
    if (p.type === 'module') {
      pass('pkg.type-module', 'package.json', 'type: module', 'ESM 包')
    } else {
      fail('pkg.type-module', 'package.json', 'type: module', `当前为 ${p.type === undefined ? '未设置（CJS 默认）' : JSON.stringify(p.type)}`, '添加 "type": "module"')
    }

    const main = typeof p.main === 'string' ? p.main : ''
    const types = typeof p.types === 'string' ? p.types : ''
    const exportsDot = (p.exports as Record<string, unknown> | undefined)?.['.']
    const entryOk = leadsToLib(main) && leadsToLib(types)
    let exportsOk = true
    let exportsMissing = true
    if (typeof exportsDot === 'object' && exportsDot !== null) {
      exportsMissing = false
      const t = (exportsDot as Record<string, unknown>).types
      const d = (exportsDot as Record<string, unknown>).default
      exportsOk = typeof t === 'string' && leadsToLib(t) && typeof d === 'string' && leadsToLib(d)
    }
    if (entryOk && exportsOk) {
      pass('pkg.entry-lib', 'package.json', 'main/types/exports 指向 lib', '入口与类型都指向 lib/')
    } else if (entryOk && exportsMissing) {
      warn('pkg.entry-lib', 'package.json', 'main/types/exports 指向 lib', 'main/types 指向 lib 但缺 exports', '添加 exports 映射（含 ./package.json）')
    } else {
      fail('pkg.entry-lib', 'package.json', 'main/types/exports 指向 lib', `main=${main} types=${types} exports=${JSON.stringify(exportsDot)}`, '让 main/types/exports 指向 lib/ 下的产物')
    }

    const files = p.files
    if (!Array.isArray(files)) {
      warn('pkg.files-lib', 'package.json', 'files 只发 lib', '未配置 files（会发布全部文件）', '添加 "files": ["lib/index.js", "lib/types/**/*.d.ts"]')
    } else {
      const badEntries = files.filter((entry) => typeof entry !== 'string' || !(entry as string).startsWith('lib'))
      const hasBundle = files.some((entry) => entry === 'lib/index.js' || entry === 'lib')
      if (badEntries.length === 0 && hasBundle) {
        pass('pkg.files-lib', 'package.json', 'files 只发 lib', `共 ${files.length} 个条目`)
      } else {
        fail('pkg.files-lib', 'package.json', 'files 只发 lib', `非法条目：${JSON.stringify(badEntries)}，缺 lib 入口`, 'files 只保留 lib 下的产物')
      }
    }

    const scripts = (p.scripts as Record<string, unknown> | undefined) ?? {}
    const requiredScripts = ['build', 'typecheck', 'test', 'prepare']
    const missingScripts = requiredScripts.filter((name) => typeof scripts[name] !== 'string')
    if (missingScripts.length === 0) {
      pass('pkg.scripts', 'package.json', 'scripts 含 build/typecheck/test/prepare', '四脚本齐全（prepare 保证发布时自动构建）')
    } else {
      fail('pkg.scripts', 'package.json', 'scripts 含 build/typecheck/test/prepare', `缺少：${missingScripts.join('、')}`, '补全对应 scripts（prepare 建议 "pnpm run build"）')
    }

    const peers = (p.peerDependencies as Record<string, unknown> | undefined) ?? {}
    const dshPeer = Object.keys(peers).find((key) => key.startsWith('@deepseek-ai/dsh-'))
    const cordisPeer = typeof peers['@deepseek-ai/cordis'] === 'string' ? peers['@deepseek-ai/cordis'] : undefined
    const pinnedPeers = Object.entries(peers)
      .filter(([key, value]) => (key.startsWith('@deepseek-ai/') && typeof value === 'string' && !isRange(value)))
      .map(([key, value]) => `${key}@${String(value)}`)
    if (cordisPeer !== undefined && dshPeer !== undefined) {
      pass('pkg.peers', 'package.json', 'peerDeps 含 cordis + dsh-*', `cordis@${cordisPeer} + ${dshPeer}`)
    } else {
      fail('pkg.peers', 'package.json', 'peerDeps 含 cordis + dsh-*', `cordis=${cordisPeer ?? '缺'} dsh-*=${dshPeer ?? '缺'}`, '把注入的 dsh-* 服务与 cordis 放进 peerDependencies（用范围）')
    }
    if (pinnedPeers.length > 0) {
      warn('pkg.peers-pinned', 'package.json', 'peerDeps 用范围版本', `精确锁定：${pinnedPeers.join('、')}`, '改用范围，如 ">=0.1.0-rc.6 <0.2.0"')
    }

    const deps = (p.dependencies as Record<string, unknown> | undefined) ?? {}
    if (typeof deps['@deepseek-ai/schemastery'] === 'string') {
      pass('pkg.dep-schemastery', 'package.json', 'schemastery 在 dependencies', `@deepseek-ai/schemastery@${deps['@deepseek-ai/schemastery']}`)
    } else {
      fail('pkg.dep-schemastery', 'package.json', 'schemastery 在 dependencies', 'dependencies 缺 @deepseek-ai/schemastery', 'schemastery 是直接依赖，放进 dependencies')
    }

    const keywords = p.keywords
    const hasKeyword = Array.isArray(keywords) && keywords.includes('dsh-plugin')
    if (hasKeyword) {
      pass('pkg.keywords', 'package.json', 'keywords 含 dsh-plugin', '可被插件生态发现')
    } else {
      warn('pkg.keywords', 'package.json', 'keywords 含 dsh-plugin', '缺 dsh-plugin 关键字', 'keywords 加入 "dsh-plugin"')
    }

    const devDeps = (p.devDependencies as Record<string, unknown> | undefined) ?? {}
    if (typeof devDeps['@types/node'] === 'string') {
      pass('pkg.devtypes-node', 'package.json', 'devDeps 含 @types/node', '@types/node 已装')
    } else {
      warn('pkg.devtypes-node', 'package.json', 'devDeps 含 @types/node', '缺 @types/node，Node 内置类型会报错', 'devDependencies 加入 @types/node')
    }
  }

  // --- tsconfig.json ----------------------------------------------------
  const tsconfig = await readJson(join(root, 'tsconfig.json'))
  if (tsconfig.value === null) {
    fail('tsconfig.missing', 'tsconfig.json', 'tsconfig.json 存在', tsconfig.error ?? '无法读取', '在仓库根添加 tsconfig.json')
  } else {
    const t = tsconfig.value
    const opts = (t.compilerOptions as Record<string, unknown> | undefined) ?? {}
    if (opts.strict === true) {
      pass('tsconfig.strict', 'tsconfig.json', 'strict 开启', 'strict: true')
    } else {
      fail('tsconfig.strict', 'tsconfig.json', 'strict 开启', `strict=${String(opts.strict)}`, '设置 "strict": true')
    }
    if (opts.declaration === true) {
      pass('tsconfig.declaration', 'tsconfig.json', 'declaration 开启', 'declaration: true')
    } else {
      fail('tsconfig.declaration', 'tsconfig.json', 'declaration 开启', `declaration=${String(opts.declaration)}`, '设置 "declaration": true')
    }
    if (opts.outDir === 'lib/types') {
      pass('tsconfig.outdir', 'tsconfig.json', 'outDir 为 lib/types', 'outDir: lib/types')
    } else {
      fail('tsconfig.outdir', 'tsconfig.json', 'outDir 为 lib/types', `outDir=${String(opts.outDir)}`, '设置 "outDir": "lib/types"')
    }
    if (opts.rootDir === 'src') {
      pass('tsconfig.rootdir', 'tsconfig.json', 'rootDir 为 src', 'rootDir: src')
    } else {
      fail('tsconfig.rootdir', 'tsconfig.json', 'rootDir 为 src', `rootDir=${String(opts.rootDir)}`, '设置 "rootDir": "src"')
    }
    if (opts.moduleResolution === 'bundler') {
      pass('tsconfig.resolution', 'tsconfig.json', 'moduleResolution bundler', 'moduleResolution: bundler')
    } else {
      warn('tsconfig.resolution', 'tsconfig.json', 'moduleResolution bundler', `moduleResolution=${String(opts.moduleResolution)}`, '设置 "moduleResolution": "bundler"（或 node16）')
    }
    const tsExt = opts.allowImportingTsExtensions === true
    const rewriteExt = opts.rewriteRelativeImportExtensions === true
    if (tsExt && rewriteExt) {
      pass('tsconfig.ts-ext', 'tsconfig.json', 'allowImportingTsExtensions + rewriteRelativeImportExtensions', '相对导入可带 .ts 后缀并被改写')
    } else {
      warn('tsconfig.ts-ext', 'tsconfig.json', 'allowImportingTsExtensions + rewriteRelativeImportExtensions', `tsExt=${String(tsExt)} rewriteExt=${String(rewriteExt)}`, '两选项同时开启（src 用 .ts 相对导入）')
    }
  }

  // --- tsdown.config.ts -------------------------------------------------
  const tsdown = await readText(join(root, 'tsdown.config.ts'))
  if (tsdown === undefined) {
    warn('tsdown.missing', 'tsdown.config.ts', 'tsdown.config.ts 存在', '未找到 tsdown.config.ts', '添加 tsdown.config.ts（打包产物）')
  } else {
    const config = stripJsComments(tsdown)
    if (config.includes('lib/types/index.js')) {
      pass('tsdown.entry', 'tsdown.config.ts', 'entry 为 lib/types/index.js', '打包入口指向 tsc 产物')
    } else {
      fail('tsdown.entry', 'tsdown.config.ts', 'entry 为 lib/types/index.js', 'entry 未指向 lib/types/index.js', 'entry: [\'lib/types/index.js\']')
    }
    if (/clean\s*:\s*true/.test(config)) {
      fail('tsdown.clean', 'tsdown.config.ts', 'clean 为 false', 'clean: true 会删掉 tsc 刚产出的入口（UNRESOLVED_ENTRY）', '设置 clean: false')
    } else if (!/clean\s*:\s*false/.test(config)) {
      warn('tsdown.clean', 'tsdown.config.ts', 'clean 为 false', '未显式设置 clean: false（默认先清 outDir，可能删掉 tsc 产物）', '设置 clean: false')
    } else {
      pass('tsdown.clean', 'tsdown.config.ts', 'clean 为 false', 'clean: false')
    }
  }

  // --- vitest.config.ts -------------------------------------------------
  const vitest = await readText(join(root, 'vitest.config.ts'))
  if (vitest === undefined) {
    warn('vitest.missing', 'vitest.config.ts', 'vitest.config.ts 存在', '未找到 vitest.config.ts（测试仍可跑，但路径解析可能出错）', '添加 vitest.config.ts')
  } else {
    if (/root\s*:/.test(vitest) || /__dirname/.test(vitest) || /fileURLToPath/.test(vitest)) {
      pass('vitest.root', 'vitest.config.ts', 'root 指向仓库根', 'root 已定位到仓库根')
    } else {
      warn('vitest.root', 'vitest.config.ts', 'root 指向仓库根', '未定位 root，测试路径可能解析错', 'root: fileURLToPath(new URL(\'.\', import.meta.url))')
    }
    if (/tests\/\*\*\/\*\.spec\.ts/.test(vitest)) {
      pass('vitest.include', 'vitest.config.ts', 'include tests/**/*.spec.ts', 'include 已配置')
    } else {
      warn('vitest.include', 'vitest.config.ts', 'include tests/**/*.spec.ts', '未匹配 tests/**/*.spec.ts', 'include: [\'tests/**/*.spec.ts\']')
    }
  }

  // --- src/index.ts -----------------------------------------------------
  const entry = await readText(join(root, 'src', 'index.ts'))
  if (entry === undefined) {
    fail('src.entry', 'src/index.ts', 'src/index.ts 存在', '未找到 src/index.ts', '添加 src/index.ts 入口')
  } else {
    const hasName = /export\s+(?:const|function)\s+name\b/.test(entry)
    const hasInject = /export\s+const\s+inject\b/.test(entry)
    const hasApply = /export\s+(?:function|const)\s+apply\b/.test(entry)
    if (hasName && hasInject && hasApply) {
      pass('src.entry', 'src/index.ts', 'name / inject / apply 三件套', '插件入口齐备')
    } else {
      fail('src.entry', 'src/index.ts', 'name / inject / apply 三件套', `name=${hasName} inject=${hasInject} apply=${hasApply}`, '导出 name / inject / apply(ctx, config)')
    }
  }

  // --- version sync -----------------------------------------------------
  const versionFile = await readText(join(root, 'src', 'version.ts'))
  const pkgVersion = pkg.value?.version
  if (versionFile !== undefined && typeof pkgVersion === 'string') {
    if (versionFile.includes(`'${pkgVersion}'`) || versionFile.includes(`"${pkgVersion}"`)) {
      pass('version.sync', 'src/version.ts', 'version.ts 与 package.json 同步', `VERSION = ${pkgVersion}`)
    } else {
      warn('version.sync', 'src/version.ts', 'version.ts 与 package.json 同步', '版本常量与 package.json 不一致', '同步 src/version.ts 的 VERSION')
    }
  }

  // --- .gitignore -------------------------------------------------------
  const gitignore = await readText(join(root, '.gitignore'))
  if (gitignore === undefined) {
    fail('gitignore.missing', '.gitignore', '.gitignore 存在', '未找到 .gitignore', '添加 .gitignore')
  } else {
    const hasNodeModules = /node_modules/.test(gitignore)
    const hasLib = /(^|\n)\s*lib\/?(\n|$)/.test(gitignore)
    if (hasNodeModules && hasLib) {
      pass('gitignore.core', '.gitignore', '忽略 node_modules/ 与 lib/', '构建与依赖产物不入库')
    } else {
      fail('gitignore.core', '.gitignore', '忽略 node_modules/ 与 lib/', `node_modules=${hasNodeModules} lib=${hasLib}`, '加入 node_modules/ 与 lib/')
    }
    if (/\.dsh/.test(gitignore)) {
      pass('gitignore.dsh', '.gitignore', '忽略 .dsh/', '个人记忆/运行数据不入库')
    } else {
      warn('gitignore.dsh', '.gitignore', '忽略 .dsh/', '未忽略 .dsh/，个人数据可能被提交', '加入 .dsh/')
    }
  }

  // --- tests/ -----------------------------------------------------------
  let testEntries: string[] = []
  try {
    testEntries = await readdir(join(root, 'tests'))
  } catch {
    testEntries = []
  }
  if (testEntries.length === 0) {
    fail('tests.dir', 'tests/', 'tests/ 目录存在', '未找到 tests/ 目录', '添加 tests/ 目录')
  } else {
    pass('tests.dir', 'tests/', 'tests/ 目录存在', `发现 ${testEntries.length} 个条目`)
  }
  const specFiles = testEntries.filter((name) => /\.(spec|test)\.(ts|js|mjs)$/.test(name))
  if (specFiles.length > 0) {
    pass('tests.cases', 'tests/', '有用例', `${specFiles.length} 个用例文件`)
  } else {
    fail('tests.cases', 'tests/', '有用例', 'tests/ 下没有 .spec/.test 用例', '添加至少一个 vitest 用例')
  }

  // --- README -----------------------------------------------------------
  const readmeZh = await readText(join(root, 'README.md'))
  const readmeEn = await readText(join(root, 'README.en.md'))
  if (readmeZh !== undefined) {
    pass('readme.zh', 'README.md', 'README.md 存在', '中文 README 在')
  } else {
    fail('readme.zh', 'README.md', 'README.md 存在', '未找到 README.md', '添加 README.md')
  }
  if (readmeEn !== undefined) {
    pass('readme.en', 'README.en.md', '双语 README', '英文 README 在')
  } else {
    warn('readme.en', 'README.en.md', '双语 README', '缺 README.en.md', '添加英文版 README（英文 | 中文链接对）')
  }
  const changelog = /##\s*(Changelog|变更记录|更新日志|历史)/i.test(readmeZh ?? '')
  if (changelog) {
    pass('readme.changelog', 'README.md', 'changelog 章节', '版本历史已记录')
  } else {
    warn('readme.changelog', 'README.md', 'changelog 章节', '缺 changelog 章节', '加 "## Changelog" 版本历史')
  }

  const failing = checks.filter((check) => check.status === 'fail').map((check) => check.id)
  return {
    root,
    checkedAt: new Date().toISOString(),
    checks,
    ready: failing.length === 0,
    failing,
  }
}

/** Render the audit report text (checklist + readiness verdict). */
export function renderReviewReport(report: ReviewReport): string {
  const icon: Record<CheckStatus, string> = { pass: '✅', fail: '❌', warn: '⚠️' }
  const lines = [
    '# plugin-review — 体检报告',
    `目标：${report.root}`,
    `时间：${report.checkedAt}`,
    '',
    '## 逐项检查',
    ...report.checks.map((check) => {
      const fix = check.fix === undefined ? '' : ` → ${check.fix}`
      return `${icon[check.status]} [${check.file}] ${check.item}：${check.detail}${fix}`
    }),
    '',
    '## 发布就绪判定',
  ]
  if (report.ready) {
    lines.push('✅ READY — 未发现阻止发布的检查项')
  } else {
    lines.push(`❌ NOT READY — 缺失项：${report.failing.join(', ')}`)
    lines.push('先按上方 ❌ 项的修复建议处理，再跑 plugin-publish 预检')
  }
  return lines.join('\n')
}

/**
 * Run the full review flow: docs freshness check first (when enabled), then
 * the static audit of the target repo, then the combined report.
 */
export async function runPluginReview(
  config: Config,
  args: { path: string; docs?: boolean },
): Promise<string> {
  const sections: string[] = []
  const checkDocs = args.docs ?? config.checkDocsBeforeReview
  if (checkDocs) {
    const { outcomes, stateWarning } = await checkOfficialDocs(config, {})
    sections.push(renderDocsCheckReport(outcomes))
    if (stateWarning !== undefined) sections.push('⚠️ ' + stateWarning)
  }
  const report = await auditPluginRepo(args.path)
  sections.push(renderReviewReport(report))
  return sections.join('\n\n')
}

/**
 * plugin-review: run docs-check first (when enabled), then statically audit a
 * target plugin repo against the hand-encoded rule set — package.json
 * (files/scripts/peer deps/type:module), tsconfig (strict/declaration),
 * tsdown (clean:false), vitest root, .gitignore, src entry, tests, README.
 * Output: a per-item pass/fail checklist with fix suggestions plus a
 * publish-readiness verdict.
 */
export function pluginReviewTool(config: Config) {
  return defineTool({
    name: 'plugin-review',
    description:
      'Audit a DeepSeek Harness plugin repo against official docs and conventions, then report a pass/fail checklist with fix suggestions and a publish-readiness verdict.',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: 'Absolute path of the target plugin repository.',
      },
      docs: {
        type: 'boolean',
        description: 'Run docs-check first. Defaults to the checkDocsBeforeReview config.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value): ContentBlock[] => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return runPluginReview(config, args)
    },
  })
}
