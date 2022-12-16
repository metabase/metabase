import type { GenericErrorResponse } from "./types";

export function getResponseErrorMessage(
  error: GenericErrorResponse,
): string | undefined {
  if (typeof error.data === "object") {
    if (typeof error.data?.message === "string") {
      return error.data.message;
    }
    if (typeof error.data?.errors?._error === "string") {
      return error.data.errors?._error;
    }
  }

  if (error.message) {
    return error.message;
  }

  if (typeof error.data === "string") {
    return error.data;
  }

  return undefined;
}
