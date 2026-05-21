/**
 * Thrown when the transport itself fails before a response is received —
 * e.g. the server dropped the connection, DNS lookup failed, or the user is
 * offline. Callers can `instanceof`-check this to render a connectivity
 * error message instead of treating it as a generic JS exception.
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
