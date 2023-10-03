import type { NumberFilterOperatorName } from "metabase-lib";

import { numberFilterValueCountMap } from "./constants";

export function isNumberFilterValid(
  operatorName: NumberFilterOperatorName | null,
  values: number[],
): boolean {
  if (!operatorName) {
    return false;
  }

  const valueCount = numberFilterValueCountMap[operatorName];

  if (valueCount === "multiple") {
    return values.length >= 1;
  }

  return values.length === valueCount;
}
