import type { Metric, MetricDimension } from "metabase-types/api";

export const createMockMetricDimension = (
  opts?: Partial<MetricDimension>,
): MetricDimension => ({
  id: "1",
  display_name: "Dimension",
  effective_type: "type/Text",
  semantic_type: null,
  ...opts,
});

export const createMockMetric = (opts?: Partial<Metric>): Metric => ({
  id: 1,
  name: "Metric",
  description: null,
  dimensions: [createMockMetricDimension()],
  collection_id: null,
  collection: null,
  ...opts,
});
