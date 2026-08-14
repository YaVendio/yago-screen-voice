/**
 * The token route answers every refusal with a short, non-sensitive reason ("realtime proxy
 * not configured", "too many credential requests"). Without surfacing it, the user and
 * whoever they call for help both see the same unactionable "try again in a moment".
 */
export async function readFailureReason(response: Response): Promise<string> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    return `${response.status} · unreadable response`
  }

  const reason =
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : 'unknown'

  return `${response.status} · ${reason}`
}

/** Names a rejection so an aborted request reads as a timeout rather than a silent failure. */
export function describeThrownFailure(error: unknown): string {
  if (error instanceof DOMException || error instanceof Error) {
    return error.name === 'TimeoutError' ? 'timeout' : error.name
  }
  return 'unknown error'
}
