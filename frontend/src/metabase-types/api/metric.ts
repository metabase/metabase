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

export type ExpressionRef =
  | ["metric", { "lib/uuid": string }, number]
  | ["measure", { "lib/uuid": string }, number];

export type InstanceFilter = {
  "lib/uuid": string;
  filter: unknown;
};

export type TypedProjection = {
  type: "metric" | "measure";
  id: number;
  projection: unknown[];
};

export type MetricDatasetDefinition = {
  expression: ExpressionRef | unknown[];
  filters?: InstanceFilter[];
  projections?: TypedProjection[];
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

export type MetricBreakoutValuesRequest = {
  definition: MetricDatasetDefinition;
};

export type MetricBreakoutValuesResponse = {
  values: unknown[];
  col: Record<string, unknown>;
};

export type GetRemappedMetricDimensionValueRequest = {
  metricId: MetricId;
  dimensionId: DimensionId;
  value: string;
};
