import type { GenericErrorResponse } from "./types";

export function getResponseErrorMessage(error: unknown): string | undefined {
  const response = error as GenericErrorResponse;

  if (typeof response.data === "object") {
    if (typeof response.data?.message === "string") {
      return response.data.message;
    }
    if (typeof response.data?.errors?._error === "string") {
      return response.data.errors?._error;
    }
  }

  if (response.message) {
    return response.message;
  }

  if (typeof response.data === "string") {
    return response.data;
  }

  return undefined;
}
