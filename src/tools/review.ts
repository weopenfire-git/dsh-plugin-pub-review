import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'

/**
 * plugin-review: run docs-check first (when enabled), then statically audit a
 * target plugin repo against the hand-encoded rule set — package.json
 * (files/scripts/peer deps/type:module), tsconfig (strict/declaration),
 * tsdown (clean:false), vitest root, .gitignore, src entry, tests, README.
 * Output: a per-item pass/fail checklist with fix suggestions plus a
 * publish-readiness verdict. TODO: implement per DESIGN.md.
 */
export function pluginReviewTool(config: Config) {
  return defineTool({
    name: 'plugin-review',
    description:
      'Audit a DeepSeek Harness plugin repo against official docs and conventions, then report a pass/fail checklist with fix suggestions and a publish-readiness verdict.',
    parameters: {
      path: { type: 'string' },
      docs: { type: 'boolean' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value): ContentBlock[] => [{ type: 'text', text: value }],
    },
    async execute() {
      return 'plugin-review is scaffolded but not implemented yet — see DESIGN.md'
    },
  })
}
