import dayjs from "dayjs";
import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { OPERATOR_OPTIONS } from "./constants";
import type { TimeValue } from "./types";

function getDefaultValue() {
  return dayjs().startOf("day").toDate(); // 00:00:00
}

export function getDefaultValues(
  operator: Lib.TimeFilterOperatorName,
  values: TimeValue[] = [],
): Date[] {
  const { valueCount } = OPERATOR_OPTIONS[operator];

  return Array(valueCount)
    .fill(getDefaultValue())
    .map((value, index) => values[index] ?? value);
}

export function hasValidValues(values: TimeValue[]): values is Date[] {
  return values.every(isNotNull);
}

export function getFilterClause(
  operator: Lib.TimeFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: TimeValue[],
) {
  if (!hasValidValues(values)) {
    return null;
  }

  return Lib.timeFilterClause({
    operator,
    column,
    values: getCoercedValues(operator, values),
  });
}

function getCoercedValues(
  operator: Lib.TimeFilterOperatorName,
  values: Date[],
) {
  if (operator === "between") {
    const [startTime, endTime] = values;
    return dayjs(endTime).isBefore(startTime)
      ? [endTime, startTime]
      : [startTime, endTime];
  }

  return values;
}
