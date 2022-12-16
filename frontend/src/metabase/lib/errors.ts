import { t } from "ttag";

export type GenericErrorResponse = {
  data?:
    | {
        message?: string;
        errors?: Record<string, string>;
      }
    | string;
  errors?: Record<string, string>;
  message?: string;
};

export const SERVER_ERROR_TYPES = {
  missingPermissions: "missing-required-permissions",
};

export function getResponseErrorMessage(
  error: GenericErrorResponse,
  fallback = t`An error occurred`,
) {
  if (typeof error.data === "object") {
    if (error.data.message) {
      return error.data.message;
    }
    if (error.data?.errors?._error) {
      return error.data.errors._error;
    }
  }
  if (error.message) {
    return error.message;
  }
  if (typeof error.data === "string") {
    return error.data;
  }
  return fallback;
}
