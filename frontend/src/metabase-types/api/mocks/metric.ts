import type {
  AddableDimensionGroup,
  AddableMetricDimension,
  Metric,
  MetricDimension,
  MetricDimensionGroup,
  NormalizedMetric,
} from "metabase-types/api";

export const createMockMetricDimension = (
  opts?: Partial<MetricDimension>,
): MetricDimension => ({
  id: "1",
  display_name: "Dimension",
  description: null,
  effective_type: "type/Text",
  semantic_type: null,
  default: false,
  ...opts,
});

export const createMockAddableMetricDimension = (
  opts?: Partial<AddableMetricDimension>,
): AddableMetricDimension => ({
  ...createMockMetricDimension(),
  mapping_target: ["field", {}, 1],
  ...opts,
});

export const createMockMetricDimensionGroup = (
  opts?: Partial<MetricDimensionGroup>,
): MetricDimensionGroup => ({
  id: "main",
  type: "main",
  display_name: "Main table",
  ...opts,
});

export const createMockAddableDimensionGroup = (
  opts?: Partial<AddableDimensionGroup>,
): AddableDimensionGroup => ({
  group: createMockMetricDimensionGroup(),
  dimensions: [createMockAddableMetricDimension()],
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

export const createMockNormalizedMetric = (
  opts?: Partial<NormalizedMetric>,
): NormalizedMetric => ({
  id: 1,
  name: "Metric",
  description: null,
  dimensions: [createMockMetricDimension()],
  collection_id: null,
  ...opts,
});
