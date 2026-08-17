import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'

/**
 * docs-check: before a review, verify the official plugin-dev docs have not
 * changed since the last check. Fetch each configured GitHub contents URL,
 * read its file sha, compare against the stored state file, and report
 * per-doc freshness. Fall back to a local DeepSeek Harness checkout when the
 * network source fails. TODO: implement per DESIGN.md.
 */
export function docsCheckTool(config: Config) {
  return defineTool({
    name: 'docs-check',
    description:
      'Check whether the official DeepSeek Harness plugin-dev docs changed since the last check (fetch GitHub contents API, fall back to a local checkout). Run before a plugin review.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value): ContentBlock[] => [{ type: 'text', text: value }],
    },
    async execute() {
      return 'docs-check is scaffolded but not implemented yet — see DESIGN.md (sources: ' + config.docsUrls.length + ' urls)'
    },
  })
}
