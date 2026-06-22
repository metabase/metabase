import type { FieldSchema } from "../data-schema";

export type ID = string | number;

export type FilterOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "between"
  | "contains"
  | "does-not-contain"
  | "starts-with"
  | "ends-with"
  | "is-empty"
  | "not-empty"
  | "is-null"
  | "not-null"
  | "time-interval";

export type QuestionQueryRuntime = {
  questionId: ID;
  parameters?: unknown;
  enabled?: boolean;
};

export type TableQueryRuntime = {
  questionId?: never;
  table?: unknown;
  tableId?: ID;
  databaseId?: ID;
  metric?: never;
  metricId?: never;
  filters?: readonly unknown[];
  aggregations?: readonly unknown[];
  measures?: readonly unknown[];
  breakouts?: readonly unknown[];
  enabled?: boolean;
};

export type MetricQueryRuntime = {
  questionId?: never;
  table?: never;
  tableId?: never;
  metric?: unknown;
  metricId?: ID;
  filters?: readonly unknown[];
  measures?: readonly unknown[];
  breakouts?: readonly unknown[];
  enabled?: boolean;
};

export type MetabaseQueryRuntime =
  | QuestionQueryRuntime
  | TableQueryRuntime
  | MetricQueryRuntime;

export type SegmentReferenceRuntime = {
  kind: "segment";
  id: number;
  tableId: number;
};

export type MeasureReferenceRuntime = {
  kind: "measure";
  id: number;
  tableId: number;
  columns?: readonly unknown[];
};

export type CountAggregationRuntime = {
  type: "count";
};

export type FieldAggregationRuntime = {
  type: "sum" | "avg" | "median" | "distinct" | "min" | "max";
  dimension: unknown;
};

export type MetricReferenceRuntime = {
  id: ID;
  databaseId?: ID;
  sourceTableId?: ID;
  sourceCardId?: ID;
  mappedTableIds: readonly number[];
};

export type DimensionFilterRuntime = {
  dimension: unknown;
  operator: FilterOperator;
  value?: unknown;
  values?: readonly unknown[];
};

export type BreakoutObjectRuntime = {
  dimension: string | FieldSchema;
  bucket?: unknown;
  binning?: unknown;
};

export type BreakoutRuntime = string | FieldSchema | BreakoutObjectRuntime;
