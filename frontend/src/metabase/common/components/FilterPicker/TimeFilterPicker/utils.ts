import type * as Lib from "metabase-lib";
import { OPERATOR_OPTIONS } from "./constants";

function getDefaultValue() {
  return new Date(2020, 0, 1, 0, 0);
}

export function getDefaultValues(
  operator: Lib.TimeFilterOperatorName,
  values: Date[] = [],
): Date[] {
  const { valueCount } = OPERATOR_OPTIONS[operator];

  return Array(valueCount)
    .fill(getDefaultValue())
    .map((value, index) => values[index] ?? value);
}
