import type { Context } from '@deepseek-ai/cordis'
import { Config } from './config.ts'
import { docsCheckTool } from './tools/docs-check.ts'
import { pluginReviewTool } from './tools/review.ts'
import { pluginPublishTool } from './tools/publish.ts'

export const name = 'dsh-plugin-doctor'
export const inject = ['tools']

export { Config }

/**
 * dsh-plugin-doctor: review other DeepSeek Harness plugins against official
 * docs and conventions, check whether official docs changed, and guide the
 * publish flow. Scaffolded — the three tools currently return TODO pointers;
 * implement them per DESIGN.md.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.tools.register(docsCheckTool(config))
  ctx.tools.register(pluginReviewTool(config))
  ctx.tools.register(pluginPublishTool(config))
}
