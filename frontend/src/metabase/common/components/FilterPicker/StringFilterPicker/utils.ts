import type { StringFilterOperatorName } from "metabase-lib/types";
import { OPERATOR_OPTIONS_MAP } from "./constants";

export function isFilterValid(
  operatorName: StringFilterOperatorName,
  values: string[],
) {
  const option = OPERATOR_OPTIONS_MAP[operatorName];
  if (!option) {
    return false;
  }

  const { valueCount } = option;
  const filledValues = values.filter(
    value => typeof value === "string" && value.length > 0,
  );

  return Number.isFinite(valueCount)
    ? filledValues.length === valueCount
    : filledValues.length >= 1;
}
