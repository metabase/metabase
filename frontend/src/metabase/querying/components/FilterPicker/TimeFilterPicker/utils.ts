import dayjs from "dayjs";
import * as Lib from "metabase-lib";
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

export function getFilterClause(
  operator: Lib.TimeFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: Date[],
) {
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
