import { isNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";

import { OPERATORS } from "./constants";
import type { NumberFilterOperatorOption, NumberOrEmptyValue } from "./types";

export function getAvailableOptions(
  column: Lib.ColumnMetadata,
): NumberFilterOperatorOption[] {
  const isKey = Lib.isPrimaryKey(column) || Lib.isForeignKey(column);
  const variant = isKey ? "default" : "number";

  return Object.values(OPERATORS).map(({ operator }) => ({
    operator,
    displayName: Lib.describeFilterOperator(operator, variant),
  }));
}

export function getOptionByOperator(operator: Lib.NumberFilterOperator) {
  return OPERATORS[operator];
}

export function getDefaultOperator(
  query: Lib.Query,
  column: Lib.ColumnMetadata,
): Lib.NumberFilterOperator {
  const fieldValuesInfo = Lib.fieldValuesSearchInfo(query, column);

  return Lib.isPrimaryKey(column) ||
    Lib.isForeignKey(column) ||
    fieldValuesInfo.hasFieldValues !== "none"
    ? "="
    : "between";
}

export function getDefaultValues(
  operator: Lib.NumberFilterOperator,
  values: NumberOrEmptyValue[],
): NumberOrEmptyValue[] {
  const { valueCount, hasMultipleValues } = OPERATORS[operator];
  if (hasMultipleValues) {
    return values.filter(isNotNull);
  }

  return Array(valueCount)
    .fill(null)
    .map((value, index) => values[index] ?? value);
}

export function isValidFilter(
  operator: Lib.NumberFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
) {
  return getFilterParts(operator, column, values) != null;
}

export function getFilterClause(
  operator: Lib.NumberFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
) {
  const filterParts = getFilterParts(operator, column, values);
  return filterParts != null ? Lib.numberFilterClause(filterParts) : undefined;
}

function getFilterParts(
  operator: Lib.NumberFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
): Lib.NumberFilterParts | undefined {
  switch (operator) {
    case "between":
      return getBetweenFilterParts(operator, column, values);
    default:
      return getSimpleFilterParts(operator, column, values);
  }
}

function getSimpleFilterParts(
  operator: Lib.NumberFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
): Lib.NumberFilterParts | undefined {
  const { valueCount, hasMultipleValues } = getOptionByOperator(operator);
  if (!values.every(isNotNull)) {
    return undefined;
  }
  if (hasMultipleValues ? values.length === 0 : values.length !== valueCount) {
    return undefined;
  }

  return {
    operator,
    column,
    values: values.filter(isNotNull),
  };
}

function getBetweenFilterParts(
  operator: Lib.NumberFilterOperator,
  column: Lib.ColumnMetadata,
  values: NumberOrEmptyValue[],
): Lib.NumberFilterParts | undefined {
  const [startValue, endValue] = values;
  if (isNotNull(startValue) && isNotNull(endValue)) {
    const minValue = startValue < endValue ? startValue : endValue;
    const maxValue = startValue < endValue ? endValue : startValue;

    return {
      operator,
      column,
      values: [minValue, maxValue],
    };
  } else if (isNotNull(startValue)) {
    return {
      operator: ">=",
      column,
      values: [startValue],
    };
  } else if (isNotNull(endValue)) {
    return {
      operator: "<=",
      column,
      values: [endValue],
    };
  }
}
