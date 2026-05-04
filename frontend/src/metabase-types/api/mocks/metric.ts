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
  const merged: Metric = {
    id: 1,
    name: "Metric",
    description: null,
    dimension_mappings: [],
    collection_id: null,
    ...opts,
  };
  const dimensions = merged.dimensions ?? [createMockMetricDimension()];
  return {
    ...merged,
    dimensions,
    dimension_ids: opts?.dimension_ids ?? dimensions.map((d) => d.id),
  };
};

export const createMockNormalizedMetric = (
  opts?: Partial<NormalizedMetric>,
): NormalizedMetric => {
  const merged: NormalizedMetric = {
    id: 1,
    name: "Metric",
    description: null,
    dimension_mappings: [],
    collection_id: null,
    ...opts,
  };
  const dimensions = merged.dimensions ?? [createMockMetricDimension()];
  return {
    ...merged,
    dimensions,
    dimension_ids: opts?.dimension_ids ?? dimensions.map((d) => d.id),
  };
};
