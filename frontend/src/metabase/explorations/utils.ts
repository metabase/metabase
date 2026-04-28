import type { Metric } from "metabase-types/api/metric";

import type { MetricOrMeasure } from "./types";

export function toMetricOrMeasure(metric: Metric): MetricOrMeasure {
  return {
    type: "metric",
    id: metric.id,
    name: metric.name,
    description: metric.description,
    dimensions: metric.dimensions ?? [],
    dimension_mappings: metric.dimension_mappings,
  };
}
