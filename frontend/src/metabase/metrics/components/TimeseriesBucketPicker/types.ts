import type * as LibMetric from "metabase-lib/metric";
import type { TemporalUnit } from "metabase-types/api";

export type ProjectionInfo = {
  definition: LibMetric.MetricDefinition;
  dimension: LibMetric.DimensionMetadata;
};

export type TemporalUnitItem = {
  value: TemporalUnit;
  label: string;
};
