import dayjs from "dayjs";
import type { TimeFilterOperatorName } from "metabase-lib";
import { OPERATOR_OPTIONS_MAP } from "./constants";

export function getDefaultValue() {
  return dayjs().startOf("day").toDate(); // 00:00:00
}

export function getDefaultValuesForOperator(
  operatorName: TimeFilterOperatorName,
): Date[] {
  const option = OPERATOR_OPTIONS_MAP[operatorName];
  const valueCount = option?.valueCount ?? 0;
  return Array(valueCount)
    .fill(null)
    .map(() => getDefaultValue());
}

export function getNextValues(values: Date[], valueCount: number): Date[] {
  const nextValues = values.slice(0, valueCount);
  while (nextValues.length < valueCount) {
    nextValues.push(getDefaultValue());
  }
  return nextValues;
}

export function isFilterValid(
  operatorName: TimeFilterOperatorName,
  values: (Date | null)[],
) {
  const option = OPERATOR_OPTIONS_MAP[operatorName];
  if (!option) {
    return false;
  }

  const { valueCount } = option;
  const filledValues = values.filter(value => value instanceof Date);

  return Number.isFinite(valueCount)
    ? filledValues.length === valueCount
    : filledValues.length >= 1;
}
