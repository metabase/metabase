import type * as LibMetric from "metabase-lib/metric";

export type DimensionWithDefinition = {
  dimension: LibMetric.DimensionMetadata;
  definition: LibMetric.MetricDefinition;
};
