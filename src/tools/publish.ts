import { exec } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'

const run = promisify(exec)

/** Read-only preflight steps run inside the target repo before publishing. */
export function preflightCommands(): string[] {
  return ['pnpm run typecheck', 'pnpm run test', 'pnpm run build', 'npm pack --dry-run']
}

/** The git steps of the publish sequence (npm publish is never auto-run). */
export function gitPublishCommands(version: string, message: string): string[] {
  return [
    'git add -A',
    `git commit -m "${message}"`,
    `git tag v${version}`,
    'git push origin main',
    `git push origin v${version}`,
  ]
}

/** The full publish sequence shown to the user (git + npm). */
export function publishCommands(version: string, message: string): string[] {
  return [...gitPublishCommands(version, message), 'pnpm publish']
}

/** Outcome of one shell step. */
export interface StepResult {
  readonly command: string
  readonly ok: boolean
  readonly output: string
}

/**
 * Run shell steps sequentially inside one working directory, capturing each
 * step's stdout+stderr (truncated to a bounded tail for the report). A step
 * that exits non-zero stops the run.
 * @param commands - shell command lines, run via the platform shell.
 * @param cwd - working directory for every step.
 * @param timeoutMs - per-step timeout.
 * @returns one result per executed step.
 */
export async function runSteps(commands: string[], cwd: string, timeoutMs = 120_000): Promise<StepResult[]> {
  const results: StepResult[] = []
  for (const command of commands) {
    try {
      const { stdout, stderr } = await run(command, { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 })
      const output = (stdout + stderr).trim()
      results.push({ command, ok: true, output: output.length > 2000 ? '…' + output.slice(-2000) : output })
    } catch (error) {
      const reason = error instanceof Error ? error : new Error(String(error))
      const detail = reason.stack ?? reason.message
      results.push({ command, ok: false, output: detail.length > 2000 ? '…' + detail.slice(-2000) : detail })
      break
    }
  }
  return results
}

/** Read the version field of a target repo's package.json. */
export async function readTargetVersion(root: string): Promise<string | undefined> {
  try {
    const raw = await readFile(join(root, 'package.json'), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    const version = (parsed as { version?: unknown } | null | undefined)?.version
    return typeof version === 'string' && version.length > 0 ? version : undefined
  } catch {
    return undefined
  }
}

function renderSteps(steps: StepResult[]): string[] {
  return steps.map((step) => {
    const mark = step.ok ? '✅' : '❌'
    const tail = step.ok && step.output.length === 0 ? '' : `\n    ${step.output.split('\n').join('\n    ')}`
    return `${mark} ${step.command}${tail}`
  })
}

/**
 * Run the publish flow: preflight the target repo (typecheck/test/build/npm
 * pack --dry-run), then either execute the git steps (config.autoRunGit) or
 * print the exact publish command sequence. npm publish always stays with
 * the user because it requires their 2FA.
 */
export async function runPluginPublish(
  config: Config,
  args: { path: string; message?: string },
): Promise<string> {
  const root = args.path
  const version = await readTargetVersion(root)
  if (version === undefined) {
    return `plugin-publish 无法读取 ${join(root, 'package.json')} 的 version，中止发布流程`
  }
  const message = args.message ?? `feat: release v${version}`

  const lines = [
    `# plugin-publish — 发布预检与引导`,
    `目标：${root}（version ${version}）`,
    '',
    '## 预检（只读）',
  ]
  const preflight = await runSteps(preflightCommands(), root)
  lines.push(...renderSteps(preflight))
  const preflightOk = preflight.every((step) => step.ok)
  if (!preflightOk) {
    lines.push('', '❌ 预检未通过 — 先修复上述失败项，再重新运行 plugin-publish')
    return lines.join('\n')
  }
  lines.push('', '✅ 预检全部通过')

  if (config.autoRunGit) {
    const git = await runSteps(gitPublishCommands(version, message), root)
    lines.push('', '## git 步骤（autoRunGit=true，已自动执行）')
    lines.push(...renderSteps(git))
    if (!git.every((step) => step.ok)) {
      lines.push('', '❌ git 步骤失败 — 手动补跑后，再执行 npm publish')
    }
  } else {
    lines.push('', '## 发布命令（按序执行）')
    lines.push('```sh')
    for (const command of publishCommands(version, message)) {
      lines.push(command)
    }
    lines.push('```')
  }
  lines.push('', '> npm publish 需要你的 2FA，插件只预检 + 引导，不会代跑。')
  return lines.join('\n')
}

/**
 * plugin-publish: preflight a target plugin repo (typecheck / test / build /
 * npm pack --dry-run) and emit the exact publish command sequence (git
 * commit/tag/push + npm publish). npm publish always stays with the user
 * (2FA); git steps run automatically only when config.autoRunGit is true.
 */
export function pluginPublishTool(config: Config) {
  return defineTool({
    name: 'plugin-publish',
    description:
      'Preflight a DeepSeek Harness plugin repo for publishing (typecheck/test/build/npm pack) and generate the publish command sequence.',
    parameters: {
      path: {
        type: 'string',
        required: true,
        description: 'Absolute path of the target plugin repository.',
      },
      message: {
        type: 'string',
        description: 'Commit message for the release commit. Defaults to "feat: release v<version>".',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value): ContentBlock[] => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return runPluginPublish(config, args)
    },
  })
}
