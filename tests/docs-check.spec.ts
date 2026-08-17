import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Config } from '../src/config.ts'
import { loadDocsState, saveDocsState } from '../src/docs-state.ts'
import { gitBlobSha, gitBlobShaOfText } from '../src/git-hash.ts'
import {
  checkOfficialDocs,
  classifyDocChange,
  contentsUrlToPath,
  renderDocsCheckReport,
} from '../src/tools/docs-check.ts'

const GITHUB_URL = 'https://api.github.com/repos/deepseek-ai/deepseek-harness/contents/docs/user/develop/basic/index.md'
const BLOB_HELLO = 'ce013625030ba8dba906f756967f9e9ca394464a'

describe('gitBlobSha', () => {
  it('matches git hash-object for "hello\\n"', () => {
    expect(gitBlobShaOfText('hello\n')).toBe(BLOB_HELLO)
    expect(gitBlobSha(Buffer.from('hello\n', 'utf8'))).toBe(BLOB_HELLO)
  })
})

describe('contentsUrlToPath', () => {
  it('maps a contents API URL to the repository-relative path', () => {
    expect(contentsUrlToPath(GITHUB_URL)).toBe('docs/user/develop/basic/index.md')
  })
  it('falls back to the last path segment for non-contents URLs', () => {
    expect(contentsUrlToPath('https://example.com/foo/bar.md')).toBe('bar.md')
  })
})

describe('classifyDocChange', () => {
  const github = { sha: 'aaa', checkedAt: '2026-01-01T00:00:00.000Z', source: 'github' as const }
  it('first check is a new baseline', () => {
    expect(classifyDocChange(undefined, 'aaa', 'github')).toBe('first')
  })
  it('same source and same sha is unchanged', () => {
    expect(classifyDocChange(github, 'aaa', 'github')).toBe('unchanged')
  })
  it('same source with a different sha is updated', () => {
    expect(classifyDocChange(github, 'bbb', 'github')).toBe('updated')
  })
  it('a source switch is a re-baseline, not an update', () => {
    expect(classifyDocChange(github, 'aaa', 'local')).toBe('rebaselined')
  })
})

describe('docs state file', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'docs-state-'))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('round-trips state and creates the parent directory', async () => {
    const file = join(dir, 'nested', 'docs-state.json')
    await saveDocsState(file, { [GITHUB_URL]: { sha: BLOB_HELLO, checkedAt: '2026-01-01T00:00:00.000Z', source: 'github' } })
    const { state, warning } = await loadDocsState(file)
    expect(state[GITHUB_URL]).toEqual({ sha: BLOB_HELLO, checkedAt: '2026-01-01T00:00:00.000Z', source: 'github' })
    expect(warning).toBeUndefined()
    const raw = await readFile(file, 'utf8')
    expect(JSON.parse(raw)[GITHUB_URL].sha).toBe(BLOB_HELLO)
  })

  it('missing state file loads as empty without a warning', async () => {
    const { state, warning } = await loadDocsState(join(dir, 'missing.json'))
    expect(state).toEqual({})
    expect(warning).toBeUndefined()
  })
})

describe('checkOfficialDocs', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'docs-check-'))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const configFor = (dir: string) => Config({ docsUrls: [GITHUB_URL], docsStateFile: join(dir, 'state.json') })

  it('reports unchanged on the second identical check', async () => {
    const config = configFor(dir)
    const now = new Date('2026-02-02T00:00:00.000Z')
    const fetchSha = async (): Promise<string> => BLOB_HELLO
    const first = await checkOfficialDocs(config, { now, fetchSha })
    expect(first.outcomes[0]?.status).toBe('first')
    const second = await checkOfficialDocs(config, { now, fetchSha })
    expect(second.outcomes[0]?.status).toBe('unchanged')
    expect(second.outcomes[0]?.previous?.checkedAt).toBe(now.toISOString())
  })

  it('reports updated when the github sha changes', async () => {
    const config = configFor(dir)
    let sha = BLOB_HELLO
    const fetchSha = async (): Promise<string> => sha
    await checkOfficialDocs(config, { now: new Date('2026-02-03T00:00:00.000Z'), fetchSha })
    sha = '0'.repeat(40)
    const updated = await checkOfficialDocs(config, { now: new Date('2026-02-04T00:00:00.000Z'), fetchSha })
    expect(updated.outcomes[0]?.status).toBe('updated')
  })

  it('falls back to the local checkout when github fails', async () => {
    const config = configFor(dir)
    const checkout = join(dir, 'checkout')
    const docPath = join(checkout, 'docs', 'user', 'develop', 'basic', 'index.md')
    await mkdir(dirname(docPath), { recursive: true })
    await writeFile(docPath, 'local content\n', 'utf8')
    const localSha = gitBlobShaOfText('local content\n')
    const result = await checkOfficialDocs(config, {
      localDocsDir: checkout,
      fetchSha: async () => {
        throw new Error('ECONNREFUSED')
      },
    })
    expect(result.outcomes[0]?.status).toBe('rebaselined') // github → local
    expect(result.outcomes[0]?.source).toBe('local')
    expect(result.outcomes[0]?.sha).toBe(localSha)
  })

  it('reports unavailable when both sources fail', async () => {
    const result = await checkOfficialDocs(Config({ docsUrls: [GITHUB_URL], docsStateFile: join(dir, 'state2.json') }), {
      localDocsDir: join(dir, 'no-such-checkout'),
      fetchSha: async () => {
        throw new Error('ECONNREFUSED')
      },
    })
    expect(result.outcomes[0]?.status).toBe('unavailable')
  })

  it('renders a report that flags updated docs for rule re-review', () => {
    const text = renderDocsCheckReport([
      { url: GITHUB_URL, name: 'basic/index.md', status: 'updated', source: 'github', sha: BLOB_HELLO, previous: { sha: 'aaa', checkedAt: '2026-01-01T00:00:00.000Z', source: 'github' } },
      { url: 'x', name: 'basic/config.md', status: 'unchanged', source: 'github', sha: 'bbb', previous: { sha: 'bbb', checkedAt: '2026-01-01T00:00:00.000Z', source: 'github' } },
    ])
    expect(text).toContain('已更新')
    expect(text).toContain('规则库需要复核')
    expect(text).toContain('自 2026-01-01T00:00:00.000Z 未变')
  })
})
