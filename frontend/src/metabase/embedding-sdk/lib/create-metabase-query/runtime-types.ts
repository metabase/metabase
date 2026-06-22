import type { FilterOperator as LibFilterOperator } from "metabase-lib/common";

export type ID = string | number;

export type FilterOperator = LibFilterOperator | "time-interval";

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

export type FieldAggregationRuntime<TDimension = unknown> = {
  type: "sum" | "avg" | "median" | "distinct" | "min" | "max";
  dimension: TDimension;
};

export type MetricReferenceRuntime = {
  id: ID;
  databaseId?: ID;
  sourceTableId?: ID;
  sourceCardId?: ID;
  mappedTableIds: readonly number[];
};

export type DimensionFilterRuntime<TDimension = unknown> = {
  dimension: TDimension;
  operator: FilterOperator;
  value?: unknown;
  values?: readonly unknown[];
};
