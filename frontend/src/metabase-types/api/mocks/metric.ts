import type {
  Metric,
  MetricDimension,
  NormalizedMetric,
} from "metabase-types/api";

export const createMockMetricDimension = (
  opts?: Partial<MetricDimension>,
): MetricDimension => ({
  id: "1",
  name: "Dimension",
  display_name: "Dimension",
  effective_type: "type/Text",
  semantic_type: null,
  ...opts,
});

export const createMockMetric = (opts?: Partial<Metric>): Metric => {
  const dimension = createMockMetricDimension();
  return {
    id: 1,
    name: "Metric",
    description: null,
    dimension_ids: [dimension.id],
    dimensions: [dimension],
    dimension_mappings: [],
    collection_id: null,
    ...opts,
  };
};

export const createMockNormalizedMetric = (
  opts?: Partial<NormalizedMetric>,
): NormalizedMetric => {
  const dimension = createMockMetricDimension();
  return {
    id: 1,
    name: "Metric",
    description: null,
    dimension_ids: [dimension.id],
    dimensions: [dimension],
    dimension_mappings: [],
    collection_id: null,
    ...opts,
  };
};
