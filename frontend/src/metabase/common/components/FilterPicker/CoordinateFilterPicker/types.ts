import type { CoordinateFilterOperatorName } from "metabase-lib";

export type CoordinateFilterValueCount = 0 | 1 | 2 | 4 | "multiple";
export type CoordinateFilterValueCountMap = Record<
  CoordinateFilterOperatorName,
  CoordinateFilterValueCount
>;
