import type { TemporalUnit } from "metabase-types/api";

export type ComparisonType = "offset" | "moving-average";

export type OffsetOptions = {
  comparisonType: ComparisonType;
  groupUnit: TemporalUnit;
  offsetUnit: TemporalUnit;
};
