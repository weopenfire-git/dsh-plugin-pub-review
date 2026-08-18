import { describe, expect, it } from 'vitest'
import { renderBanner, renderHelp } from '../src/status.ts'

describe('renderBanner', () => {
  it('shows the version and the registered slash commands', () => {
    const text = renderBanner('0.2.0', ['plugin-review', 'plugin-publish', 'doctor-help'])
    expect(text).toContain('dsh-plugin-pub-review v0.2.0')
    expect(text).toContain('/plugin-review')
    expect(text).toContain('/plugin-publish')
    expect(text).toContain('/doctor-help')
    expect(text).toContain('docs-check → plugin-review → plugin-publish')
  })

  it('falls back to a hint when the commands service is not mounted', () => {
    expect(renderBanner('0.2.0', [])).toContain('未挂载 commands 服务')
  })

  it('stays inside the banner borders', () => {
    const text = renderBanner('0.2.0', ['plugin-review', 'plugin-publish', 'doctor-help'])
    const lines = text.split('\n')
    expect(lines[0].startsWith('╭')).toBe(true)
    expect(lines[lines.length - 1].startsWith('╰')).toBe(true)
    for (const line of lines.slice(1, -1)) {
      expect(line.startsWith('│ ')).toBe(true)
      expect(line.endsWith(' │')).toBe(true)
    }
  })
})

describe('renderHelp', () => {
  it('lists the three tools and the slash commands', () => {
    const text = renderHelp()
    expect(text).toContain('docs-check')
    expect(text).toContain('plugin-review')
    expect(text).toContain('plugin-publish')
    expect(text).toContain('/plugin-review')
    expect(text).toContain('/plugin-publish')
    expect(text).toContain('/doctor-help')
    expect(text).toContain('checkDocsBeforeReview')
  })
})
