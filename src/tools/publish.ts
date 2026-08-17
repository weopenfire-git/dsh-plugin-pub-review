import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'

/**
 * plugin-publish: preflight a target plugin repo (typecheck / test / build /
 * npm pack --dry-run) and emit the exact publish command sequence (git
 * commit/tag/push + npm publish). npm publish always stays with the user
 * (2FA); git steps run automatically only when config.autoRunGit is true.
 * TODO: implement per DESIGN.md.
 */
export function pluginPublishTool(config: Config) {
  return defineTool({
    name: 'plugin-publish',
    description:
      'Preflight a DeepSeek Harness plugin repo for publishing (typecheck/test/build/npm pack) and generate the publish command sequence.',
    parameters: {
      path: { type: 'string' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value): ContentBlock[] => [{ type: 'text', text: value }],
    },
    async execute() {
      return 'plugin-publish is scaffolded but not implemented yet — see DESIGN.md (autoRunGit: ' + config.autoRunGit + ')'
    },
  })
}
