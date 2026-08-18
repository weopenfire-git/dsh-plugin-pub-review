import { describe, expect, it } from 'vitest'
import { Config } from '../src/config.ts'
import { VERSION } from '../src/version.ts'

describe('Config', () => {
  it('applies defaults', () => {
    const config = Config({})
    expect(config.docsUrls.length).toBe(4)
    expect(config.docsUrls[0]).toContain('api.github.com')
    expect(config.checkDocsBeforeReview).toBe(true)
    expect(config.autoRunGit).toBe(false)
  })
})

describe('VERSION', () => {
  it('matches package.json', () => {
    expect(VERSION).toBe('0.2.0')
  })
})
