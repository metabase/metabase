import type { TimeFilterOperatorName } from "metabase-lib";
import { DEFAULT_VALUE, OPERATOR_OPTIONS } from "./constants";

export function getDefaultValuesForOperator(
  operatorName: TimeFilterOperatorName,
): Date[] {
  const option = OPERATOR_OPTIONS.find(
    option => option.operator === operatorName,
  );
  if (!option) {
    return [];
  }
  return Array(option.valueCount).fill(DEFAULT_VALUE);
}

export function isFilterValid(
  operatorName: TimeFilterOperatorName,
  values: Date[],
) {
  const option = OPERATOR_OPTIONS.find(
    option => option.operator === operatorName,
  );
  if (!option) {
    return false;
  }

  const { valueCount } = option;
  const filledValues = values.filter(value => value instanceof Date);

  return Number.isFinite(valueCount)
    ? filledValues.length === valueCount
    : filledValues.length >= 1;
}
