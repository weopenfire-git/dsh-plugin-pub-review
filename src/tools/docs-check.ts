import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from '../config.ts'
import { loadDocsState, saveDocsState, type DocsState, type DocsStateEntry } from '../docs-state.ts'
import { gitBlobSha } from '../git-hash.ts'

/** Source that produced a doc's sha. */
export type DocSource = 'github' | 'local'

/** One doc's freshness verdict for this run. */
export type DocCheckStatus = 'unchanged' | 'updated' | 'first' | 'rebaselined' | 'unavailable'

/** Freshness verdict for one configured doc URL. */
export interface DocCheckOutcome {
  readonly url: string
  /** Human label, e.g. `basic/index.md`. */
  readonly name: string
  readonly status: DocCheckStatus
  readonly source: DocSource | 'none'
  readonly sha?: string
  /** The previously stored record, when one existed. */
  readonly previous?: DocsStateEntry
  /** Failure detail when status is `unavailable`. */
  readonly error?: string
}

/**
 * Map a GitHub contents API URL to the repository-relative file path, e.g.
 * `.../contents/docs/user/develop/basic/index.md` → `docs/user/develop/basic/index.md`.
 * @param url - the configured contents API URL.
 * @returns the relative path, or the URL's last segment when the URL is not
 * a contents API URL.
 */
export function contentsUrlToPath(url: string): string {
  const match = /\/contents\/(.+)$/.exec(url)
  if (match === null || match[1] === undefined) return url.slice(url.lastIndexOf('/') + 1)
  return match[1]
}

/**
 * Decide a doc's freshness status from its stored record and the freshly
 * fetched sha. Shas are only compared within one source: a source switch is a
 * re-baseline, not an update signal, because a local checkout may hash the
 * same content differently (e.g. CRLF line endings on Windows).
 * @param stored - the previously stored record, or undefined on first check.
 * @param sha - the freshly fetched sha.
 * @param source - which source produced `sha`.
 */
export function classifyDocChange(
  stored: DocsStateEntry | undefined,
  sha: string,
  source: DocSource,
): DocCheckStatus {
  if (stored === undefined) return 'first'
  if (stored.source !== source) return 'rebaselined'
  return stored.sha === sha ? 'unchanged' : 'updated'
}

/** Fetch the file sha from one GitHub contents API URL. */
async function fetchGitHubSha(url: string, timeoutMs = 10_000): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const body: unknown = await response.json()
  const sha = (body as { sha?: unknown } | null | undefined)?.sha
  if (typeof sha !== 'string' || sha.length === 0) throw new Error('response has no sha')
  return sha
}

/**
 * Compute the blob id of a doc file inside a local DeepSeek Harness
 * checkout, mirroring the GitHub contents API `sha` for the same path.
 * @param checkoutRoot - the checkout root containing `docs/`.
 * @param relativePath - repository-relative doc path.
 * @returns the blob id, or undefined when the file does not exist.
 */
async function localFileSha(checkoutRoot: string, relativePath: string): Promise<string | undefined> {
  try {
    const bytes = await readFile(join(checkoutRoot, relativePath))
    return gitBlobSha(bytes)
  } catch {
    return undefined
  }
}

/**
 * Run the docs freshness check: fetch each configured contents API URL,
 * fall back to a local checkout when the network source fails, compare every
 * sha against the stored state, persist the new state, and report per-doc
 * freshness. Pure sources are injected so tests can substitute a fetch.
 */
export async function checkOfficialDocs(
  config: Config,
  options: { localDocsDir?: string; now?: Date; fetchSha?: (url: string) => Promise<string> } = {},
): Promise<{ outcomes: DocCheckOutcome[]; state: DocsState; stateWarning?: string }> {
  const now = options.now ?? new Date()
  const { state, warning } = await loadDocsState(config.docsStateFile)
  const next: DocsState = {}
  const outcomes: DocCheckOutcome[] = []

  for (const url of config.docsUrls) {
    const name = contentsUrlToPath(url)
    const stored = state[url]

    /** Successfully fetched sha with its source, or a failure description. */
    let fetched: { sha: string; source: DocSource } | { error: string }
    try {
      const sha = await (options.fetchSha ?? fetchGitHubSha)(url)
      fetched = { sha, source: 'github' }
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : String(fetchError)
      const fallbackSha = options.localDocsDir !== undefined && options.localDocsDir.length > 0
        ? await localFileSha(options.localDocsDir, name)
        : undefined
      if (fallbackSha !== undefined) {
        fetched = { sha: fallbackSha, source: 'local' }
      } else {
        const suffix = options.localDocsDir !== undefined && options.localDocsDir.length > 0
          ? `且本地无 ${name}`
          : ''
        fetched = { error: `网络源失败（${message}）${suffix}` }
      }
    }

    if ('error' in fetched) {
      outcomes.push({ url, name, status: 'unavailable', source: 'none', previous: stored, error: fetched.error })
      continue
    }
    const { sha, source } = fetched

    const status = classifyDocChange(stored, sha, source)
    const entry: DocsStateEntry = { sha, checkedAt: now.toISOString(), source }
    next[url] = entry
    outcomes.push({ url, name, status, source, sha, previous: stored })
  }

  let saveError: string | undefined
  try {
    await saveDocsState(config.docsStateFile, next)
  } catch (writeError) {
    saveError = writeError instanceof Error ? writeError.message : String(writeError)
  }

  const stateWarning = warning !== undefined
    ? warning
    : saveError !== undefined
      ? `状态文件写入失败：${saveError}`
      : undefined
  return { outcomes, state: next, stateWarning }
}

/** Render the docs-check report text. */
export function renderDocsCheckReport(outcomes: DocCheckOutcome[]): string {
  const lines = ['# docs-check — 官方插件开发文档新鲜度', '']
  const updated: string[] = []
  for (const outcome of outcomes) {
    const source = outcome.source === 'github' ? 'github' : outcome.source === 'local' ? '本地' : '—'
    let line: string
    switch (outcome.status) {
      case 'unchanged':
        line = `自 ${outcome.previous?.checkedAt ?? '?'} 未变`
        break
      case 'updated':
        line = `已更新（上次 ${outcome.previous?.checkedAt ?? '?'}）→ 规则库需要复核`
        updated.push(outcome.name)
        break
      case 'first':
        line = `新建档（首次检查）`
        break
      case 'rebaselined':
        line = `检查源切换（${outcome.previous?.source ?? '?'} → ${outcome.source}），已重新建档`
        break
      case 'unavailable':
        line = `无法检查：${outcome.error ?? '未知错误'}`
        break
    }
    lines.push(`- ${outcome.name} [${source}] ${line}`)
  }
  lines.push('')
  if (updated.length > 0) {
    lines.push(`结论：${updated.length}/${outcomes.length} 篇已更新（${updated.join('、')}）→ 规则库需要复核后再审查`)
  } else {
    lines.push(`结论：${outcomes.length}/${outcomes.length} 篇未变或已建档，规则库无需复核`)
  }
  return lines.join('\n')
}

/**
 * docs-check: before a review, verify the official plugin-dev docs have not
 * changed since the last check. Fetch each configured GitHub contents URL,
 * read its file sha, compare against the stored state file, and report
 * per-doc freshness. Falls back to a local DeepSeek Harness checkout when
 * the network source fails.
 */
export function docsCheckTool(config: Config) {
  return defineTool({
    name: 'docs-check',
    description:
      'Check whether the official DeepSeek Harness plugin-dev docs changed since the last check (fetch GitHub contents API, fall back to a local checkout). Run before a plugin review.',
    parameters: {
      localDocsDir: {
        type: 'string',
        description: 'Optional root of a local deepseek-harness checkout used as offline fallback.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value): ContentBlock[] => [{ type: 'text', text: value }],
    },
    async execute(args) {
      const { outcomes, stateWarning } = await checkOfficialDocs(config, {
        localDocsDir: args.localDocsDir,
      })
      const report = renderDocsCheckReport(outcomes)
      return stateWarning === undefined ? report : report + '\n\n⚠️ ' + stateWarning
    },
  })
}
