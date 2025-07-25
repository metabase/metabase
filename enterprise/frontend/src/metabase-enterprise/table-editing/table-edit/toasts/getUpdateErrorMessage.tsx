import { t } from "ttag";

import type { GenericErrorResponse } from "metabase/lib/errors";

export const getUpdateApiErrorMessage = (
  error: GenericErrorResponse | unknown,
): string => {
  const maybeError = error as GenericErrorResponse;

  if (typeof maybeError.data === "string") {
    return maybeError.data;
  }

  if (
    Array.isArray(maybeError.data?.errors) &&
    "error" in maybeError.data?.errors[0]
  ) {
    return maybeError.data.errors[0].error;
  }

  if (Array.isArray(maybeError.errors) && "error" in maybeError.errors[0]) {
    return maybeError.errors[0].error;
  }

  return t`Unknown error`;
};
