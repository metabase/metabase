import type {
  Metric,
  MetricDimension,
  NormalizedMetric,
} from "metabase-types/api";

export const createMockMetricDimension = (
  opts?: Partial<MetricDimension>,
): MetricDimension => ({
  id: "1",
  "display-name": "Dimension",
  "effective-type": "type/Text",
  "semantic-type": null,
  ...opts,
});

export const createMockMetric = (opts?: Partial<Metric>): Metric => ({
  id: 1,
  name: "Metric",
  description: null,
  dimensions: [createMockMetricDimension()],
  dimension_mappings: [],
  collection_id: null,
  collection: null,
  ...opts,
});

export const createMockNormalizedMetric = (
  opts?: Partial<NormalizedMetric>,
): NormalizedMetric => ({
  id: 1,
  name: "Metric",
  description: null,
  dimensions: [createMockMetricDimension()],
  dimension_mappings: [],
  collection_id: null,
  ...opts,
});
