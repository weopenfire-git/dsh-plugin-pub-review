import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import z from '@deepseek-ai/schemastery'

/**
 * dsh-plugin-pub-review configuration.
 *
 * The doctor runs a checkup on another dsh plugin repo: first it checks
 * whether the official plugin-dev docs changed (docs-check), then it audits
 * the target repo against a hand-encoded rule set (plugin-review), and finally
 * it preflights and guides the publish flow (plugin-publish).
 *
 * Docs freshness uses the GitHub contents API (returns the git blob sha, so a
 * comparison needs no content diff). raw.githubusercontent.com is unreachable
 * from some networks (e.g. CN), so the contents API is the primary source and
 * a local DeepSeek Harness checkout is the fallback — see DESIGN.md.
 */
export interface Config {
  /** Official plugin-dev docs to freshness-check, as GitHub contents API URLs. */
  docsUrls: string[]
  /** Where the last-checked doc shas are stored. */
  docsStateFile: string
  /** Whether plugin-review runs docs-check first. */
  checkDocsBeforeReview: boolean
  /** Whether plugin-publish executes git steps, or only prints the commands. */
  autoRunGit: boolean
}

export const Config: z<Config> = z.object({
  docsUrls: z.array(z.string()).default([
    'https://api.github.com/repos/deepseek-ai/deepseek-harness/contents/docs/user/develop/basic/index.md',
    'https://api.github.com/repos/deepseek-ai/deepseek-harness/contents/docs/user/develop/basic/config.md',
    'https://api.github.com/repos/deepseek-ai/deepseek-harness/contents/docs/user/develop/basic/tool.md',
    'https://api.github.com/repos/deepseek-ai/deepseek-harness/contents/docs/user/develop/basic/publish.md',
  ]),
  docsStateFile: z.string().default(dshHomePath('plugin-pub-review', 'docs-state.json')),
  checkDocsBeforeReview: z.boolean().default(true),
  autoRunGit: z.boolean().default(false),
})
