import { getFriendlyName } from "./utils";

import { t } from "ttag";

export const NULL_DIMENSION_WARNING = "NULL_DIMENSION_WARNING";
export function nullDimensionWarning() {
  return {
    key: NULL_DIMENSION_WARNING,
    text: t`Data includes missing dimension values.`,
  };
}

export const INVALID_DATE_WARNING = "INVALID_DATE_WARNING";
export function invalidDateWarning(value) {
  return {
    key: INVALID_DATE_WARNING,
    text: t`We encountered an invalid date: "${value}"`,
  };
}

export const UNAGGREGATED_DATA_WARNING = "UNAGGREGATED_DATA_WARNING";
export function unaggregatedDataWarning(col) {
  return {
    key: UNAGGREGATED_DATA_WARNING,
    text: t`"${getFriendlyName(
      col,
    )}" is an unaggregated field: if it has more than one value at a point on the x-axis, the values will be summed.`,
  };
}

export const UNEXPECTED_QUERY_TIMEZONE = "UNEXPECTED_QUERY_TIMEZONE";
export function unexpectedTimezoneWarning({
  actual_timezone,
  expected_timezone,
}) {
  return {
    key: UNEXPECTED_QUERY_TIMEZONE,
    text: t`The query for this chart was run in ${actual_timezone} rather than ${expected_timezone} due to database or driver constraints.`,
  };
}
