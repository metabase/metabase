import type { GenericErrorResponse } from "./types";

/**
 * @deprecated Use `getErrorMessage` from `metabase/api/utils` instead.
 */
export function getResponseErrorMessage(error: unknown): string | undefined {
  const response = error as GenericErrorResponse | undefined;

  if (!response) {
    return undefined;
  }

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

export function isResourceNotFoundError(error: any) {
  return error instanceof Object && "status" in error && error.status === 404;
}
