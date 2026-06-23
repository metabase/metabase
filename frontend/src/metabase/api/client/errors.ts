/**
 * Thrown when the transport itself fails before a response is received —
 * e.g. the server dropped the connection, DNS lookup failed, or the user is
 * offline. Callers `isNetworkError`-check to render a connectivity error
 * message instead of treating it as a generic failure.
 */
export class NetworkError extends Error {
  constructor(message = "Network error") {
    super(message);
    this.name = "NetworkError";
  }
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof NetworkError;
}

/**
 * Thrown when a response *was* received — its status line and some body bytes
 * already committed — but reading the body then failed partway through. A
 * streamed query or export that errors mid-stream aborts the connection without
 * a clean terminator, which rejects the body read. This is deliberately distinct
 * from `NetworkError` (where the transport never delivered a response at all):
 * the server answered and then the stream broke, so the UI must not blame the
 * user's connectivity or imply the server is down.
 */
export class StreamInterruptedError extends Error {
  constructor(message = "Stream interrupted") {
    super(message);
    this.name = "StreamInterruptedError";
  }
}

export function isStreamInterruptedError(
  error: unknown,
): error is StreamInterruptedError {
  return error instanceof StreamInterruptedError;
}

/**
 * `true` for the standard `DOMException` of name `"AbortError"` that
 * `fetch()` rejects with when its signal aborts. Use this in place of the
 * legacy `error.isCancelled` flag.
 */
export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

export function getErrorStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return undefined;
}

export function isRetriableError(error: unknown): boolean {
  return getErrorStatus(error) === 503;
}
