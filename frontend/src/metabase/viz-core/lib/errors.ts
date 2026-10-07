import { msgid, ngettext, t } from "ttag";

import { SERVER_ERROR_TYPES } from "metabase/utils/errors";
import type { Dataset, IconName } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

export class MinColumnsError extends Error {
  constructor(minColumns: number) {
    super(
      t`Doh! The data from your query doesn't fit the chosen display choice. This visualization requires at least ${minColumns} ${ngettext(
        msgid`column`,
        `columns`,
        minColumns,
      )} of data.`,
    );
    this.name = "MinColumnsError";
  }
}

export class MinRowsError extends Error {
  constructor(actualRows: number) {
    super(
      t`No dice. We have ${actualRows} data ${ngettext(
        msgid`point`,
        `points`,
        actualRows,
      )} to show and that's not enough for this visualization.`,
    );
    this.name = "MinRowsError";
  }
}

export class LatitudeLongitudeError extends Error {
  constructor() {
    super(
      t`Bummer. We can't actually do a pin map for this data because we require both a latitude and longitude column.`,
    );
    this.name = "LatitudeLongitudeError";
  }
}

/**
 * These errors are usually thrown from within the `checkRenderable` visualization utility.
 * We rely on this type of error (in conjunction with the `hasEmptyState` and a few other properties)
 * to determine whether or not to display the empty visuzalization state.
 */
export class ChartSettingsError extends Error {
  initial?: { section: string };
  buttonText: string;

  constructor(
    message?: string,
    initial?: { section: string },
    buttonText?: string,
  ) {
    super(message || t`Please configure this chart in the chart settings`);
    this.name = "ChartSettingsError";
    this.initial = initial;
    this.buttonText = buttonText || t`Edit Settings`;
  }
}

export function getGenericErrorMessage() {
  return t`There was a problem displaying this chart.`;
}

export function getPermissionErrorMessage() {
  return t`Sorry, you don't have permission to see this card.`;
}

export function getDatasetPermissionError(
  dataset: Pick<Dataset, "error" | "error_type">,
): { message: string; icon: "key" } | undefined {
  const isPermissionError =
    dataset.error_type === SERVER_ERROR_TYPES.missingPermissions ||
    (dataset.error != null &&
      typeof dataset.error === "object" &&
      dataset.error.status === 403);

  return isPermissionError
    ? { message: getPermissionErrorMessage(), icon: "key" }
    : undefined;
}

export function getDatasetError(
  dataset: Pick<Dataset, "error" | "error_type" | "error_is_curated">,
): { message: string; icon: IconName } | undefined {
  const { error } = dataset;
  if (error == null) {
    return undefined;
  }

  const permissionError = getDatasetPermissionError(dataset);
  if (permissionError) {
    return permissionError;
  }

  return {
    message:
      dataset.error_is_curated && typeof error === "string"
        ? error
        : getGenericErrorMessage(),
    icon: "warning",
  };
}

type DatasetFailure = Pick<
  Dataset,
  "error" | "error_type" | "error_is_curated"
>;

/**
 * Turns a failed `POST /api/dataset` request into the error fields a failed
 * dataset carries, so it can go through `getDatasetError`.
 */
export function getDatasetRequestFailure(
  requestError: unknown,
): DatasetFailure | undefined {
  if (!isObject(requestError) || typeof requestError.status !== "number") {
    return undefined;
  }
  const { status, data } = requestError;
  if (status === 403 || !isObject(data) || typeof data.error !== "string") {
    return { error: { status, data } };
  }
  return {
    error: data.error,
    error_type:
      typeof data.error_type === "string" ? data.error_type : undefined,
    error_is_curated: data.error_is_curated === true,
  };
}
