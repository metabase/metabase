import type * as Lib from "metabase-lib";
import { OPERATOR_OPTIONS } from "./constants";
import type { NumberValue } from "./types";

function isNotEmpty(value: NumberValue) {
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

export function hasValidValues(
  operator: Lib.NumberFilterOperatorName,
  values: NumberValue[] = [],
): values is number[] {
  const { valueCount, hasMultipleValues } = OPERATOR_OPTIONS[operator];
  if (!values.every(isNotEmpty)) {
    return false;
  }

  return hasMultipleValues ? values.length > 0 : values.length === valueCount;
}

export function getCoercedValues(
  operator: Lib.NumberFilterOperatorName,
  values: number[],
) {
  if (operator === "between") {
    const [startValue, endValue] = values;
    return endValue < startValue
      ? [endValue, startValue]
      : [startValue, endValue];
  }

  return values;
}
