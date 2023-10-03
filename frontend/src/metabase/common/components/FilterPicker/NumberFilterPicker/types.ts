import type { NumberFilterOperatorName } from "metabase-lib";

export type NumberFilterValueCount = 0 | 1 | 2 | "multiple";
export type NumberFilterValueCountMap = Partial<
  Record<NumberFilterOperatorName, NumberFilterValueCount>
>;
