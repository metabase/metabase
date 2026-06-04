import type { CollectionId, DimensionId, Metric } from "metabase-types/api";

export type ExplorationMetric = Metric & {
  dimension_ids: DimensionId[]; // dimension_ids are required for explorations`
};

export interface ExplorationCollection {
  id?: CollectionId;
  name: string;
}

export type NewExplorationMode = "entry" | "plan";
