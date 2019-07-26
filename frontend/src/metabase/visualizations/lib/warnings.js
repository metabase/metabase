import { getFriendlyName } from "./utils";

import { t } from "ttag";

export const NULL_DIMENSION_WARNING = "NULL_DIMENSION_WARNING";
export function nullDimensionWarning() {
  return {
    key: NULL_DIMENSION_WARNING,
    text: "Data includes missing dimension values.",
  };
}

export const INVALID_DATE_WARNING = "INVALID_DATE_WARNING";
export function invalidDateWarning(value) {
  return {
    key: INVALID_DATE_WARNING,
    text: `We encountered an invalid date: "${value}"`,
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
