import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  gitPublishCommands,
  preflightCommands,
  publishCommands,
  readTargetVersion,
} from '../src/tools/publish.ts'

describe('publish command generation', () => {
  it('preflight runs the four read-only steps in order', () => {
    expect(preflightCommands()).toEqual([
      'pnpm run typecheck',
      'pnpm run test',
      'pnpm run build',
      'npm pack --dry-run',
    ])
  })

  it('git steps tag and push the exact version, pushing the tag explicitly', () => {
    expect(gitPublishCommands('0.1.0', 'feat: release v0.1.0')).toEqual([
      'git add -A',
      'git commit -m "feat: release v0.1.0"',
      'git tag v0.1.0',
      'git push origin main',
      'git push origin v0.1.0',
    ])
  })

  it('the full sequence appends npm publish', () => {
    const commands = publishCommands('0.1.0', 'feat: initial')
    expect(commands).toHaveLength(6)
    expect(commands[commands.length - 1]).toBe('pnpm publish')
    expect(commands).toContain('git tag v0.1.0')
  })

  it('uses a custom commit message when given', () => {
    expect(gitPublishCommands('0.2.0', 'fix: release')[1]).toBe('git commit -m "fix: release"')
  })
})

describe('readTargetVersion', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'doctor-publish-'))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reads the version from package.json', async () => {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '0.1.0' }), 'utf8')
    expect(await readTargetVersion(dir)).toBe('0.1.0')
  })

  it('returns undefined when package.json is missing or unversioned', async () => {
    expect(await readTargetVersion(join(dir, 'missing'))).toBeUndefined()
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'x' }), 'utf8')
    expect(await readTargetVersion(dir)).toBeUndefined()
  })
})
