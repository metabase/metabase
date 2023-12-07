import * as Lib from "metabase-lib";
import { OPERATOR_OPTIONS } from "./constants";
import type { NumberValue } from "./types";

function isNotEmpty(value: NumberValue): value is number {
  return value !== "";
}

export function getDefaultValues(
  operator: Lib.NumberFilterOperatorName,
  values: NumberValue[] = [],
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
  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];

  if (operator === "between") {
    const [startValue, endValue] = values;
    if (isNotEmpty(startValue) && isNotEmpty(endValue)) {
      return {
        operator,
        column,
        values: [
          Math.min(startValue, endValue),
          Math.max(startValue, endValue),
        ],
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
    } else {
      return undefined;
    }
  }

  if (!values.every(isNotEmpty)) {
    return undefined;
  }
  if (hasMultipleValues && values.length === 0) {
    return undefined;
  }
  if (values.length !== valueCount) {
    return undefined;
  }

  return {
    operator,
    column,
    values: values.filter(isNotEmpty),
  };
}
