import {
  getDatasetError,
  getDatasetPermissionError,
  getDatasetRequestFailure,
  getGenericErrorMessage,
} from "metabase/viz-core";
import type { Dataset } from "metabase-types/api";

export type ChartError = NonNullable<ReturnType<typeof getDatasetError>> & {
  details?: string;
};

export function getChartError(
  dataset: Dataset | undefined,
  requestError: unknown,
): ChartError | undefined {
  const failure = requestError
    ? getDatasetRequestFailure(requestError)
    : dataset;
  if (requestError && !failure) {
    return { message: getGenericErrorMessage(), icon: "warning" };
  }
  if (!failure) {
    return undefined;
  }

  const permissionError = getDatasetPermissionError(failure);
  if (permissionError) {
    return permissionError;
  }

  const error = getDatasetError(failure);
  if (!error) {
    return undefined;
  }
  const rawError = failure.error;
  const hasDetails = typeof rawError === "string" && rawError !== error.message;
  return hasDetails ? { ...error, details: rawError } : error;
}
