import type { GenericErrorResponse } from "./types";

export function getResponseErrorMessage(
  error: GenericErrorResponse,
): string | undefined {
  if (typeof error.data === "object") {
    return error.data?.message ?? error.data?.errors?._error;
  }
  return error.message ?? error.data;
}
