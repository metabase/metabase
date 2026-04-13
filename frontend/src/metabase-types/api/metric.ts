import type { Collection, CollectionId } from "./collection";
import type { DatasetColumn, RowValue } from "./dataset";
import type { FieldValue } from "./field";
import type { DimensionId, DimensionMapping, MetricDimension } from "./measure";

export type {
  DimensionMapping,
  MetricDimension,
  MetricDimensionGroup,
  MetricDimensionSource,
} from "./measure";

export type MetricId = number;

export type Metric = {
  id: MetricId;
  name: string;
  description: string | null;
  dimensions: MetricDimension[];
  dimension_mappings?: DimensionMapping[];
  collection_id: CollectionId | null;
  collection: Collection | null;
  result_column_name?: string;
};

export const MATH_OPERATORS = ["+", "-", "*", "/"] as const;
export type MathOperator = (typeof MATH_OPERATORS)[number];

export function isMathOperator(key: string): key is MathOperator {
  return (MATH_OPERATORS as readonly string[]).includes(key);
}

export const MATH_EXPRESSION_OPERATORS = [
  ...MATH_OPERATORS,
  "(",
  ")",
  ",",
] as const;
export type MathExpressionOperator = (typeof MATH_OPERATORS)[number];

export function isMathExpressionOperator(
  key: string,
): key is MathExpressionOperator {
  return (MATH_EXPRESSION_OPERATORS as readonly string[]).includes(key);
}

export type JsExpressionRef =
  | ["metric", { "lib/uuid": string }, number]
  | ["measure", { "lib/uuid": string }, number];

export type ExpressionRef =
  | JsExpressionRef
  | [
      MathOperator,
      Record<string, never>,
      ExpressionRef | number,
      ExpressionRef | number,
    ];

export type InstanceFilter = {
  "lib/uuid": string;
  filter: unknown;
};

export type TypedProjection = {
  type: "metric" | "measure";
  id: number;
  "lib/uuid": string;
  projection: unknown[];
};

export type JsMetricDefinition = {
  expression: JsExpressionRef | unknown[];
  filters?: InstanceFilter[];
  projections?: TypedProjection[];
};

export type MetricDatasetRequest = {
  definition: JsMetricDefinition;
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
  definition: JsMetricDefinition;
};

export type MetricBreakoutValuesResponse = {
  values: RowValue[];
  col: DatasetColumn;
};

export type GetRemappedMetricDimensionValueRequest = {
  metricId: MetricId;
  dimensionId: DimensionId;
  value: string;
};
