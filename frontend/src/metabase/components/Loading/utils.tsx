import { t } from "ttag";

import type {
  CoreLoadingProps,
  CoreLoadingPropsVariant,
  LoadableResult,
} from "./types";

/** Return the first truthy value in the input, or false if there are no truthy values */
export const or = <T,>(
  /** The input can be either an array or a single value */
  arg: T | T[],
) => (Array.isArray(arg) ? arg.find(Boolean) : arg) || false;

export const getErrorAndLoading = (
  props: CoreLoadingPropsVariant,
): [any, any] => {
  let error: any = false;
  let loading = false;
  if ("result" in props) {
    const { result } = props;
    const results = Array.isArray(result) ? result : [result];
    error = or(results.map(r => r?.error));
    loading = or(results.map(r => r?.isLoading));
  } else {
    const coreProps = props as CoreLoadingProps;
    error = or(coreProps.error);
    loading = or(coreProps.loading);
  }
  return [error, loading];
};

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

export const unready = (resultOrResults: LoadableResult | LoadableResult[]) => {
  const [error, loading] = getErrorAndLoading({ result: resultOrResults });
  return Boolean(error || loading);
};
