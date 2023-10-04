import type { StringFilterOperatorName } from "metabase-lib";

export type StringFilterValueCount = 0 | 1 | "multiple";
export type StringFilterValueCountMap = Record<
  StringFilterOperatorName,
  StringFilterValueCount
>;
