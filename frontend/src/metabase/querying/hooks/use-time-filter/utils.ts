import dayjs from "dayjs";
import * as Lib from "metabase-lib";
import { isNotNull } from "metabase/lib/types";
import { getAvailableOperatorOptions } from "metabase/querying/utils/filters";
import { OPERATOR_OPTIONS } from "./constants";
import type { TimeValue } from "./types";

export function getAvailableOptions(
  query: Lib.Query,
  stageIndex: number,
  column: Lib.ColumnMetadata,
) {
  return getAvailableOperatorOptions(
    query,
    stageIndex,
    column,
    OPERATOR_OPTIONS,
  );
}

export function getOptionByOperator(operator: Lib.TimeFilterOperatorName) {
  return OPERATOR_OPTIONS[operator];
}

function getDefaultValue() {
  return dayjs().startOf("day").toDate(); // 00:00:00
}

export function getDefaultValues(
  operator: Lib.TimeFilterOperatorName,
  values: TimeValue[],
): TimeValue[] {
  const { valueCount } = OPERATOR_OPTIONS[operator];

  return Array(valueCount)
    .fill(getDefaultValue())
    .map((value, index) => values[index] ?? value);
}

export function isValidFilter(
  operator: Lib.TimeFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: TimeValue[],
) {
  return getFilterParts(operator, column, values) != null;
}

export function getFilterClause(
  operator: Lib.TimeFilterOperatorName,
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
  operator: Lib.TimeFilterOperatorName,
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
