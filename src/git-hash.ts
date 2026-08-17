import { createHash } from 'node:crypto'

/**
 * Compute the git blob object id for raw file bytes, matching
 * `git hash-object` and the `sha` field the GitHub contents API returns for
 * a file (both are SHA-1 of `blob <size>\0<bytes>`).
 * @param bytes - the exact file bytes as read from disk.
 * @returns the 40-character lowercase hex blob id.
 */
export function gitBlobSha(bytes: Uint8Array): string {
  const prefix = `blob ${bytes.byteLength}\0`
  const hash = createHash('sha1')
  hash.update(prefix, 'utf8')
  hash.update(bytes)
  return hash.digest('hex')
}

/**
 * Compute the git blob id for a UTF-8 string.
 * @param content - the file content.
 * @returns the 40-character lowercase hex blob id.
 */
export function gitBlobShaOfText(content: string): string {
  return gitBlobSha(Buffer.from(content, 'utf8'))
}
