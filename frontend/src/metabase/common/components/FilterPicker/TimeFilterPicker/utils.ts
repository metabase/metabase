import dayjs from "dayjs";
import type * as Lib from "metabase-lib";
import { OPERATOR_OPTIONS } from "./constants";

function getDefaultValue() {
  return dayjs().startOf("day").toDate(); // 00:00:00
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
