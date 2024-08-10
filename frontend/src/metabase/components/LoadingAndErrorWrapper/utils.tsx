import { t } from "ttag";

import type { CoreLoadingProps, LoadableResult } from "./types";

/** Return the first truthy value in the input, or false if there are no truthy values */
export const or = <T,>(
  /** The input can be either an array or a single value */
  arg: T | T[],
) => (Array.isArray(arg) ? arg.find(Boolean) : arg) || false;

export const getErrorAndLoading = ({
  error,
  loading,
}: CoreLoadingProps): [any, boolean] => [or(error), or(loading)];

export const getErrorMessage = (error: any) => {
  // NOTE: Dashboard API endpoint returns the error as JSON with `message` field
  const message =
    error?.data?.message ||
    error?.data ||
    error?.statusText ||
    error?.message ||
    error;
  if (message && typeof message === "string") {
    return message;
  } else {
    return t`An error occurred`;
  }
};

export const unready = (result: LoadableResult) => {
  const [error, loading] = getErrorAndLoading(result);
  return Boolean(error || loading);
};
