import type { StringFilterOperatorName } from "metabase-lib";

import { stringFilterValueCountMap } from "./constants";

export function isStringFilterValid(
  operatorName: StringFilterOperatorName | null,
  values: string[],
): boolean {
  if (!operatorName) {
    return false;
  }

  const valueCount = stringFilterValueCountMap[operatorName];

  if (valueCount === "multiple") {
    return values.length >= 1;
  }

  return values.length === valueCount;
}
