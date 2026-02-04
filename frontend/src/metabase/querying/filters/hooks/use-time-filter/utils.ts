import dayjs from "dayjs";
import { t } from "ttag";

import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";

import { OPERATORS } from "./constants";
import type { TimeFilterOperatorOption, TimeValue } from "./types";

function getOperatorName(operator: Lib.TimeFilterOperator) {
  switch (operator) {
    case "<":
      return t`Before`;
    case ">":
      return t`After`;
    case "between":
      return t`Between`;
    case "is-null":
      return t`Is empty`;
    case "not-null":
      return t`Not empty`;
  }
}

export function getAvailableOptions(): TimeFilterOperatorOption[] {
  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: getOperatorName(operator),
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
