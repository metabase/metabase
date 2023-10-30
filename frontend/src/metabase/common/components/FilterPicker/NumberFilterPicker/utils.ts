import type { NumberFilterOperatorName } from "metabase-lib/types";
import { OPERATOR_OPTIONS } from "./constants";

export function isFilterValid(
  operatorName: NumberFilterOperatorName,
  values: number[],
) {
  const option = OPERATOR_OPTIONS[operatorName];
  if (!option) {
    return false;
  }

  const { valueCount } = option;
  const filledValues = values.filter(
    value => typeof value === "number" && Number.isFinite(value),
  );

  return Number.isFinite(valueCount)
    ? filledValues.length === valueCount
    : filledValues.length >= 1;
}
