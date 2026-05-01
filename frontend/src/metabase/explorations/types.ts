import type { DimensionId, Metric } from "metabase-types/api";

export type ExplorationMetric = Metric & {
  dimension_ids: DimensionId[]; // dimension_ids are required for explorations`
};
