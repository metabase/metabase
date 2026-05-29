/**
 * Thrown when the transport itself fails before a response is received —
 * e.g. the server dropped the connection, DNS lookup failed, or the user is
 * offline. Shaped as a plain object (not an `Error` subclass) so it round-trips
 * through `JSON.stringify` and RTK Query's `serializableCheck` middleware —
 * matches the `{ isCancelled }` and `{ status, data }` shapes also thrown from
 * `_dispatch`. Callers `isNetworkError`-check to render a connectivity error
 * message instead of treating it as a generic failure.
 */
export type NetworkError = {
  isNetworkError: true;
  message: string;
};

export function networkError(message = "Network error"): NetworkError {
  return { isNetworkError: true, message };
}

export function isNetworkError(error: unknown): error is NetworkError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isNetworkError?: unknown }).isNetworkError === true
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
