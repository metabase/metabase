import type { ActionExecuteError } from "../types";

/**
 * Adapter at the public-API boundary: takes whatever the underlying network
 * client throws (legacy-client's wrapped response body, a native `Error`
 * from a transport failure, anything else) and produces a clean
 * `ActionExecuteError`. The public type must NOT leak the internal shape
 * (`via`, `cause`, `trace`, etc.) — this helper drops it.
 *
 * `status` is omitted when no HTTP response was received (transport-layer
 * failure, native `Error`, or anything that doesn't carry a numeric
 * `status` field). `isCancelled` is `true` for `AbortError`/`DOMException`
 * aborts so consumers can ignore user-cancelled actions without inspecting
 * the message.
 */
export const toActionExecuteError = (error: unknown): ActionExecuteError => {
  const isAbort =
    error != null &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "AbortError";

  if (
    error != null &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    const { status, data, isCancelled } = error as {
      status: number;
      data?: unknown;
      isCancelled?: unknown;
    };
    // Most JSON error bodies are `{ message: "..." }`, but some endpoints
    // (e.g. Metabase's "Not found.") return a plain string body — fall back
    // to that so consumers always have a human-readable diagnostic.
    const message =
      typeof data === "string"
        ? data
        : typeof (data as { message?: unknown })?.message === "string"
          ? (data as { message: string }).message
          : undefined;
    // The execute endpoint may also include an `errors` map keyed by
    // parameter slug (`{ <slug>: <message> }`), or an empty `{}` for
    // whole-request failures. Pass it through when present and well-shaped.
    const rawErrors = (data as { errors?: unknown })?.errors;
    const errors =
      rawErrors != null &&
      typeof rawErrors === "object" &&
      !Array.isArray(rawErrors)
        ? (rawErrors as Record<string, string>)
        : undefined;

    return {
      status,
      data: { message, ...(errors ? { errors } : {}) },
      isCancelled: isAbort || Boolean(isCancelled),
    };
  }

  return {
    data: { message: error instanceof Error ? error.message : String(error) },
    isCancelled: isAbort,
  };
};
