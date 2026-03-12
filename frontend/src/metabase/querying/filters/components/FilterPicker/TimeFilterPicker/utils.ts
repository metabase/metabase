import dayjs from "dayjs";

import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";

import { OPERATORS } from "./constants";
import type { TimeFilterOperatorOption, TimeValue } from "./types";

export function getAvailableOptions(): TimeFilterOperatorOption[] {
  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: Lib.describeFilterOperator(operator, "temporal"),
  }));
}

export function getOptionByOperator(operator: Lib.TimeFilterOperator) {
  return OPERATORS[operator];
}

export function getDefaultOperator(): Lib.TimeFilterOperator {
  return "<";
}

function getDefaultValue() {
  return dayjs().startOf("day").toDate(); // 00:00:00
}

export function getDefaultValues(
  operator: Lib.TimeFilterOperator,
  values: TimeValue[],
): TimeValue[] {
  const { valueCount } = OPERATORS[operator];

  return Array(valueCount)
    .fill(getDefaultValue())
    .map((value, index) => values[index] ?? value);
}

export function isValidFilter(
  operator: Lib.TimeFilterOperator,
  column: Lib.ColumnMetadata,
  values: TimeValue[],
) {
  return getFilterParts(operator, column, values) != null;
}

export function getFilterClause(
  operator: Lib.TimeFilterOperator,
  column: Lib.ColumnMetadata,
  values: TimeValue[],
) {
  const filterParts = getFilterParts(operator, column, values);
  if (filterParts == null) {
    return undefined;
  }

  return Lib.timeFilterClause(filterParts);
}

function getFilterParts(
  operator: Lib.TimeFilterOperator,
  column: Lib.ColumnMetadata,
  values: TimeValue[],
): Lib.TimeFilterParts | undefined {
  if (!values.every(isNotNull)) {
    return undefined;
  }

  if (operator === "between") {
    const [startTime, endTime] = values;
    return {
      operator,
      column,
      values: dayjs(endTime).isBefore(startTime)
        ? [endTime, startTime]
        : [startTime, endTime],
    };
  }

  return {
    operator,
    column,
    values,
  };
}
