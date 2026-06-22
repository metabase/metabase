import type {
  FieldSchema,
  MetricSchema,
  SchemaColumn,
  TableSchema,
} from "embedding-sdk-shared/lib/create-metabase-query/schema";
import type { FilterOperator as LibFilterOperator } from "metabase-lib/common";
import type { BinningOptions } from "metabase-lib/query";

type ID = string | number;

export type FilterOperator = LibFilterOperator | "time-interval";

export type SqlParameterValuesRuntime = Record<
  string,
  | string
  | number
  | boolean
  | readonly (string | number | boolean | null)[]
  | null
  | undefined
>;

export type ColumnReferenceRuntime = string | FieldSchema;

export type BreakoutRuntime<TDimension = ColumnReferenceRuntime> =
  | TDimension
  | {
      dimension: TDimension;
      bucket?: string;
      binning?: BinningOptions;
    };

export type QuestionQueryRuntime = {
  questionId: ID;
  parameters?: SqlParameterValuesRuntime;
  enabled?: boolean;
};

export type TableQueryRuntime = {
  questionId?: never;
  table?: TableSchema;
  tableId?: ID;
  databaseId?: number;
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
  metric?: MetricReferenceRuntime;
  metricId?: number;
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
  columns?: readonly SchemaColumn[];
};

export type CountAggregationRuntime = {
  type: "count";
};

export type FieldAggregationRuntime<TDimension = unknown> = {
  type: "sum" | "avg" | "median" | "distinct" | "min" | "max";
  dimension: TDimension;
};

export type MetricReferenceRuntime = Pick<MetricSchema, "dimensions"> & {
  id: number;
  databaseId?: number;
  sourceTableId?: number;
  sourceCardId?: number;
  mappedTableIds: readonly number[];
  columns?: MetricSchema["columns"];
};

export type DimensionFilterRuntime<TDimension = ColumnReferenceRuntime> = {
  dimension: TDimension;
  operator: FilterOperator;
  value?: unknown;
  values?: readonly unknown[];
};
