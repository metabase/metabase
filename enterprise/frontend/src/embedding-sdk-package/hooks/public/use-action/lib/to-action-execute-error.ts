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
 * `status` field).
 */
export const toActionExecuteError = (error: unknown): ActionExecuteError => {
  if (
    error != null &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    const { status, data, isCancelled } = error as {
      status: number;
      data?: { message?: unknown };
      isCancelled?: unknown;
    };
    const message =
      typeof data?.message === "string" ? data.message : undefined;

    return {
      status,
      data: { message },
      isCancelled: Boolean(isCancelled),
    };
  }

  return {
    data: { message: error instanceof Error ? error.message : String(error) },
    isCancelled: false,
  };
};
