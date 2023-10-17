import moment from "moment";
import type { TimeFilterOperatorName } from "metabase-lib";
import { OPERATOR_OPTIONS } from "./constants";

export function getDefaultValue() {
  return moment().startOf("day").toDate(); // 00:00:00
}

export function getDefaultValuesForOperator(
  operatorName: TimeFilterOperatorName,
): Date[] {
  const option = OPERATOR_OPTIONS.find(
    option => option.operator === operatorName,
  );
  if (!option) {
    return [];
  }
  return Array(option.valueCount)
    .fill(null)
    .map(() => getDefaultValue());
}

export function isFilterValid(
  operatorName: TimeFilterOperatorName,
  values: (Date | null)[],
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
