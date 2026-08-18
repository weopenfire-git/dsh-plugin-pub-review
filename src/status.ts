/** Inner banner width in terminal cells (borders add two more columns). */
const INNER = 56

/** Approximate terminal cell width; exact for ASCII, best-effort for wide glyphs. */
function cells(text: string): number {
  return [...text].length
}

/** Left-align text to a fixed cell width. */
function pad(text: string, width: number): string {
  const extra = width - cells(text)
  return extra > 0 ? text + ' '.repeat(extra) : text
}

/**
 * Render the plugin startup banner: version, the three tools, and the
 * available slash commands. Pure and deterministic so it can be tested and
 * shared with the onboarding help text.
 * @param version - plugin version shown in the title.
 * @param commands - names of the registered slash commands; empty when the
 * commands service is not mounted.
 */
export function renderBanner(version: string, commands: readonly string[]): string {
  const bar = '─'.repeat(INNER + 2)
  const row = (text: string) => '│ ' + pad(text, INNER) + ' │'
  const commandLine = commands.length > 0
    ? commands.map((name) => '/' + name).join('  ')
    : '（未挂载 commands 服务，仅保留工具能力）'
  return [
    '╭' + bar + '╮',
    row(`dsh-plugin-pub-review v${version} — 给 dsh 插件做发布就绪审查`),
    row(''),
    row('体检流程：docs-check → plugin-review → plugin-publish'),
    row('斜杠命令：' + commandLine),
    row(''),
    row('npm publish 始终需要你的 2FA，插件只预检 + 引导'),
    '╰' + bar + '╯',
  ].join('\n')
}

/** Usage guidance rendered by the /doctor-help command. */
export function renderHelp(): string {
  return [
    '# dsh-plugin-pub-review — 使用引导',
    '',
    '发布就绪审查流程（医院比喻）：',
    '  [1] docs-check      审查前核对官方插件开发文档是否更新（GitHub sha 对比，本地 checkout 兜底）',
    '  [2] plugin-review   静态体检目标仓库：30+ 项检查 → ✅/⚠️/❌ 清单 + 修复药方 + 发布就绪判定',
    '  [3] plugin-publish  只读预检（typecheck / test / build / npm pack）+ 发布命令序列引导',
    '',
    '命令：/plugin-review   /plugin-publish   /doctor-help',
    '',
    '配置（config.ts）：checkDocsBeforeReview / autoRunGit / docsUrls / docsStateFile',
    '细节见 README.md 与 DESIGN.md。',
  ].join('\n')
}
