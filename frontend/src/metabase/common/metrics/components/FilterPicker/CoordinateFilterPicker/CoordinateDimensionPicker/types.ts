import type * as LibMetric from "metabase-lib/metric";

export type DimensionOption = {
  dimension: LibMetric.DimensionMetadata;
  value: string;
  label: string;
};
