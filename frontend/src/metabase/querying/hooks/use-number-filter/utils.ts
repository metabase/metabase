import {
  getAvailableOperatorOptions,
  getDefaultAvailableOperator,
} from "metabase/querying/utils/filters";
import * as Lib from "metabase-lib";

import { OPERATOR_OPTIONS } from "./constants";
import type { NumberValue, OperatorOption } from "./types";

function isNotEmpty(value: NumberValue): value is number {
  return value !== "";
}

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

export function getOptionByOperator(operator: Lib.NumberFilterOperatorName) {
  return OPERATOR_OPTIONS[operator];
}

export function getDefaultOperator(
  column: Lib.ColumnMetadata,
  availableOptions: OperatorOption[],
): Lib.NumberFilterOperatorName {
  const desiredOperator =
    Lib.isPrimaryKey(column) ||
    Lib.isForeignKey(column) ||
    Lib.isCategory(column)
      ? "="
      : "between";
  return getDefaultAvailableOperator(availableOptions, desiredOperator);
}

export function getDefaultValues(
  operator: Lib.NumberFilterOperatorName,
  values: NumberValue[],
): NumberValue[] {
  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  if (hasMultipleValues) {
    return values.filter(isNotEmpty);
  }

  return Array(valueCount)
    .fill("")
    .map((value, index) => values[index] ?? value);
}

export function isValidFilter(
  operator: Lib.NumberFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: NumberValue[],
) {
  return getFilterParts(operator, column, values) != null;
}

export function getFilterClause(
  operator: Lib.NumberFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: NumberValue[],
) {
  const filterParts = getFilterParts(operator, column, values);
  return filterParts != null ? Lib.numberFilterClause(filterParts) : undefined;
}

function getFilterParts(
  operator: Lib.NumberFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: NumberValue[],
): Lib.NumberFilterParts | undefined {
  switch (operator) {
    case "between":
      return getBetweenFilterParts(operator, column, values);
    default:
      return getSimpleFilterParts(operator, column, values);
  }
}

function getSimpleFilterParts(
  operator: Lib.NumberFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: NumberValue[],
): Lib.NumberFilterParts | undefined {
  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  if (!values.every(isNotEmpty)) {
    return undefined;
  }
  if (hasMultipleValues ? values.length === 0 : values.length !== valueCount) {
    return undefined;
  }

  return {
    operator,
    column,
    values: values.filter(isNotEmpty),
  };
}

function getBetweenFilterParts(
  operator: Lib.NumberFilterOperatorName,
  column: Lib.ColumnMetadata,
  values: NumberValue[],
): Lib.NumberFilterParts | undefined {
  const [startValue, endValue] = values;
  if (isNotEmpty(startValue) && isNotEmpty(endValue)) {
    return {
      operator,
      column,
      values: [Math.min(startValue, endValue), Math.max(startValue, endValue)],
    };
  } else if (isNotEmpty(startValue)) {
    return {
      operator: ">=",
      column,
      values: [startValue],
    };
  } else if (isNotEmpty(endValue)) {
    return {
      operator: "<=",
      column,
      values: [endValue],
    };
  }
}
