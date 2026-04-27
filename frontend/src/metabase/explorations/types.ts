import type {
  DimensionMapping,
  MeasureId,
  MetricDimension,
  MetricId,
} from "metabase-types/api";

export interface MetricOrMeasure {
  type: "metric" | "measure";
  id: MetricId | MeasureId;
  name: string;
  description: string | null;
  dimensions: MetricDimension[];
  dimension_mappings?: DimensionMapping[];
}

export type { MetricDimension, Timeline } from "metabase-types/api";
