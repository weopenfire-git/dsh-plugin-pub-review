import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { Config } from './config.ts'
import { renderBanner, renderHelp } from './status.ts'
import { docsCheckTool } from './tools/docs-check.ts'
import { pluginPublishTool, runPluginPublish } from './tools/publish.ts'
import { pluginReviewTool, runPluginReview } from './tools/review.ts'
import { VERSION } from './version.ts'

export const name = 'dsh-plugin-doctor'
export const inject = ['tools']

export { Config }

/** Expected outcome of one slash command, mirroring the dsh-commands types. */
type CommandResult = { kind: 'success'; text?: string } | { kind: 'error'; text: string }

/** Minimal structural view of the optional dsh-commands registry (no hard dependency). */
interface DoctorCommandRuntime {
  register(def: {
    name: string
    description: string
    handler: (inv: { agent: Agent }) => CommandResult | Promise<CommandResult>
  }): () => void
}

/** Wrap an async runner as a command handler producing success/error results. */
function commandHandler(run: (cwd: string) => Promise<string>): (inv: { agent: Agent }) => Promise<CommandResult> {
  return async ({ agent }) => {
    try {
      const text = await run(agent.session.header.cwd ?? process.cwd())
      return { kind: 'success', text }
    } catch (error) {
      return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
    }
  }
}

/**
 * Register the optional slash commands when the commands service is mounted.
 * @returns the names of the commands that were actually registered.
 */
function registerCommands(ctx: Context, config: Config): string[] {
  const commands = ctx.get('commands') as DoctorCommandRuntime | undefined
  if (commands === undefined) return []
  commands.register({
    name: 'plugin-review',
    description: '体检当前工作区的插件仓库（先查官方文档更新，再静态检查，给发布就绪判定）。',
    handler: commandHandler((cwd) => runPluginReview(config, { path: cwd })),
  })
  commands.register({
    name: 'plugin-publish',
    description: '预检当前工作区的插件仓库并引导发布流程（typecheck/test/build/npm pack + 命令序列）。',
    handler: commandHandler((cwd) => runPluginPublish(config, { path: cwd })),
  })
  commands.register({
    name: 'doctor-help',
    description: '显示 dsh-plugin-doctor 的体检流程与使用引导。',
    handler: () => ({ kind: 'success', text: renderHelp() }),
  })
  return ['plugin-review', 'plugin-publish', 'doctor-help']
}

/**
 * dsh-plugin-doctor: review other DeepSeek Harness plugins against official
 * docs and conventions, check whether the official plugin-dev docs changed,
 * and preflight/guide the publish flow. Three tools plus optional slash
 * commands and a startup banner.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(docsCheckTool(config))
  ctx.tools.register(pluginReviewTool(config))
  ctx.tools.register(pluginPublishTool(config))
  const commands = registerCommands(ctx, config)
  console.log(renderBanner(VERSION, commands))
}
