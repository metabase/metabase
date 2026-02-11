import type { Collection, CollectionId } from "./collection";
import type { FieldValue } from "./field";
import type { DimensionId } from "./measure";

export type MetricId = number;

export type Metric = {
  id: MetricId;
  name: string;
  description: string | null;
  dimensions: MetricDimension[];
  collection_id: CollectionId | null;
  collection: Collection | null;
};

export type MetricDimensionGroup = {
  id: string;
  type: "main" | "connection";
  display_name: string;
};

export type MetricDimension = {
  id: DimensionId;
  display_name: string;
  effective_type: string;
  semantic_type: string | null;
  group?: MetricDimensionGroup;
};

declare const _JsMetricDefinitionSymbol: unique symbol;

export type JsMetricDefinition = unknown & {
  _opaque: typeof _JsMetricDefinitionSymbol;
};

export type MetricDatasetDefinition = {
  "source-metric"?: MetricId;
  "source-measure"?: number;
  filters?: unknown[]; // TODO: update type
  projections?: unknown[]; // TODO: update type
};

export type MetricDatasetRequest = {
  definition: MetricDatasetDefinition;
};

export type GetMetricDimensionValuesRequest = {
  metricId: MetricId;
  dimensionId: DimensionId;
};

export type GetMetricDimensionValuesResponse = {
  values: FieldValue[];
  has_more_values: boolean;
};

export type SearchMetricDimensionValuesRequest = {
  metricId: MetricId;
  dimensionId: DimensionId;
  query: string;
  limit: number;
};

export type GetRemappedMetricDimensionValueRequest = {
  metricId: MetricId;
  dimensionId: DimensionId;
  value: string;
};
