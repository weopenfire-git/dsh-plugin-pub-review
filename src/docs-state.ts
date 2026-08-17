import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/**
 * One doc's last-checked freshness record. `source` records which data
 * source produced `sha`; a GitHub blob id and a local-checkout blob id may
 * differ for the same content (e.g. CRLF checkout on Windows), so change
 * detection only compares shas produced by the same source.
 */
export interface DocsStateEntry {
  readonly sha: string
  readonly checkedAt: string
  readonly source: 'github' | 'local'
}

/** Persisted docs freshness state: contents-API URL → last-checked record. */
export type DocsState = Record<string, DocsStateEntry>

/**
 * Read the docs freshness state file. A missing or unreadable file yields an
 * empty state (first check); a malformed file yields an empty state with a
 * note, never a hard failure.
 * @param file - absolute path of the JSON state file.
 * @returns the loaded state plus a warning when the file was unreadable.
 */
export async function loadDocsState(file: string): Promise<{ state: DocsState; warning?: string }> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return { state: {} }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { state: {}, warning: `docs state file ${file} is not an object; starting fresh` }
    }
    return { state: parsed as DocsState }
  } catch {
    return { state: {}, warning: `docs state file ${file} is malformed; starting fresh` }
  }
}

/**
 * Persist the docs freshness state, creating the parent directory as needed.
 * @param file - absolute path of the JSON state file.
 * @param state - the full state to write.
 * @throws when the file cannot be written.
 */
export async function saveDocsState(file: string, state: DocsState): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(state, null, 2) + '\n', 'utf8')
}
