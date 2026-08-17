import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { auditPluginRepo, renderReviewReport, type ReviewReport } from '../src/tools/review.ts'

/** Write one file under the fixture root, creating parent directories. */
async function write(root: string, relative: string, content: string): Promise<void> {
  const target = join(root, relative)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
}

const COMPLIANT = {
  'package.json': JSON.stringify({
    name: '@yinging/fixture-plugin',
    version: '0.1.0',
    publishConfig: { access: 'public' },
    type: 'module',
    main: 'lib/index.js',
    types: 'lib/types/index.d.ts',
    exports: {
      '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
      './package.json': './package.json',
    },
    files: ['lib/index.js', 'lib/types/**/*.d.ts'],
    keywords: ['dsh-plugin'],
    scripts: {
      build: 'tsc -p tsconfig.json && tsdown',
      typecheck: 'tsc -p tsconfig.json --noEmit',
      test: 'vitest run',
      prepare: 'pnpm run build',
    },
    dependencies: { '@deepseek-ai/schemastery': '3.18.1' },
    peerDependencies: {
      '@deepseek-ai/cordis': '>=4.0.0 <5.0.0',
      '@deepseek-ai/dsh-tools': '>=0.1.0-rc.6 <0.2.0',
    },
    devDependencies: { '@types/node': '^22.20.0' },
  }, null, 2),
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'es2024',
      module: 'esnext',
      moduleResolution: 'bundler',
      strict: true,
      declaration: true,
      outDir: 'lib/types',
      rootDir: 'src',
      allowImportingTsExtensions: true,
      rewriteRelativeImportExtensions: true,
    },
    include: ['src'],
  }, null, 2),
  'tsdown.config.ts': `import { defineConfig } from 'tsdown'
export default defineConfig({
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  clean: false,
})
`,
  'vitest.config.ts': `import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
const dir = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  test: { root: dir, include: ['tests/**/*.spec.ts'] },
})
`,
  'src/index.ts': `export const name = 'fixture-plugin'
export const inject = ['tools']
export function apply() {}
`,
  'src/version.ts': `export const VERSION = '0.1.0'
`,
  '.gitignore': 'node_modules/\nlib/\n*.tsbuildinfo\n.dsh/\n',
  'tests/sample.spec.ts': `import { expect, it } from 'vitest'
it('works', () => { expect(1).toBe(1) })
`,
  'README.md': '# fixture\n\n## Changelog\n\n- v0.1.0 initial\n',
  'README.en.md': '# fixture\n\n## Changelog\n\n- v0.1.0 initial\n',
}

describe('auditPluginRepo', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'doctor-review-'))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('passes a compliant plugin repo and declares it ready', async () => {
    const root = join(dir, 'compliant')
    await mkdir(root, { recursive: true })
    for (const [relative, content] of Object.entries(COMPLIANT)) {
      await write(root, relative, content)
    }
    const report: ReviewReport = await auditPluginRepo(root)
    expect(report.ready).toBe(true)
    expect(report.failing).toEqual([])
    const ids = report.checks.map((check) => check.id)
    for (const expected of ['pkg.name-version', 'pkg.type-module', 'pkg.entry-lib', 'pkg.files-lib', 'pkg.scripts', 'pkg.peers', 'pkg.dep-schemastery', 'tsconfig.strict', 'tsconfig.declaration', 'tsconfig.outdir', 'tsconfig.rootdir', 'tsdown.entry', 'tsdown.clean', 'src.entry', 'version.sync', 'gitignore.core', 'tests.dir', 'tests.cases', 'readme.zh', 'readme.en', 'readme.changelog']) {
      expect(ids).toContain(expected)
    }
  })

  it('fails an empty repo with the missing-file checklist', async () => {
    const root = join(dir, 'broken')
    await mkdir(root, { recursive: true })
    await write(root, 'package.json', JSON.stringify({ name: 'broken', version: '0.1.0', main: 'index.js' }))
    const report = await auditPluginRepo(root)
    expect(report.ready).toBe(false)
    for (const id of ['pkg.type-module', 'pkg.entry-lib', 'pkg.scripts', 'pkg.peers', 'pkg.dep-schemastery', 'tsconfig.missing', 'src.entry', 'gitignore.missing', 'tests.dir', 'readme.zh']) {
      expect(report.failing).toContain(id)
    }
    expect(report.checks.some((check) => check.id === 'pkg.keywords' && check.status === 'warn')).toBe(true)
  })

  it('flags tsdown clean:true as a fail and exact-pinned peers as a warn', async () => {
    const root = join(dir, 'pitfalls')
    await mkdir(root, { recursive: true })
    for (const [relative, content] of Object.entries(COMPLIANT)) {
      await write(root, relative, content)
    }
    await write(root, 'tsdown.config.ts', `export default { entry: ['lib/types/index.js'], clean: true }\n`)
    await write(root, 'package.json', JSON.stringify({
      ...JSON.parse(COMPLIANT['package.json']),
      peerDependencies: { '@deepseek-ai/cordis': '4.0.1', '@deepseek-ai/dsh-tools': '0.1.0-rc.6' },
    }, null, 2))
    const report = await auditPluginRepo(root)
    expect(report.failing).toContain('tsdown.clean')
    expect(report.checks.some((check) => check.id === 'pkg.peers-pinned' && check.status === 'warn')).toBe(true)
  })

  it('renders the report with pass/fail icons and a not-ready verdict', async () => {
    const root = join(dir, 'render')
    await mkdir(root, { recursive: true })
    await write(root, 'package.json', '{}')
    const report = await auditPluginRepo(root)
    const text = renderReviewReport(report)
    expect(text).toContain('❌')
    expect(text).toContain('NOT READY')
    expect(text).toContain(report.failing[0] ?? '')
  })
})
