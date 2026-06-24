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

export type SqlParameterValuesInput = Record<
  string,
  | string
  | number
  | boolean
  | readonly (string | number | boolean | null)[]
  | null
  | undefined
>;

export type ColumnReferenceInput = string | FieldSchema;

export type BreakoutInput<TDimension = ColumnReferenceInput> =
  | TDimension
  | {
      dimension: TDimension;
      bucket?: string;
      binning?: BinningOptions;
    };

export type QuestionQueryInput = {
  questionId: ID;
  parameters?: SqlParameterValuesInput;
  enabled?: boolean;
};

export type TableQueryInput = {
  table: TableSchema;

  questionId?: never;
  metric?: never;
  metricId?: never;

  filters?: readonly unknown[];
  aggregations?: readonly unknown[];
  measures?: readonly unknown[];
  breakouts?: readonly unknown[];
  sorts?: readonly unknown[];
  limit?: number;

  enabled?: boolean;
};

export type MetricQueryInput = {
  metric?: MetricReference;
  metricId?: number;

  questionId?: never;
  table?: never;
  tableId?: never;

  filters?: readonly unknown[];
  measures?: readonly unknown[];
  breakouts?: readonly unknown[];
  sorts?: readonly unknown[];
  limit?: number;

  enabled?: boolean;
};

export type MetabaseQueryInput =
  | QuestionQueryInput
  | TableQueryInput
  | MetricQueryInput;

export type SegmentReferenceInput = {
  kind: "segment";
  id: number;
  tableId: number;
};

export type MeasureReferenceInput = {
  kind: "measure";
  id: number;
  tableId: number;
  columns?: readonly SchemaColumn[];
};

export type CountAggregationInput = {
  type: "count";
};

export type FieldAggregationInput<TDimension = unknown> = {
  type: "sum" | "avg" | "median" | "distinct" | "min" | "max";
  dimension: TDimension;
};

export type MetricReference = Pick<MetricSchema, "dimensions"> & {
  id: number;
  databaseId?: number;
  sourceTableId?: number;
  sourceCardId?: number;
  mappedTableIds: readonly number[];
  columns?: MetricSchema["columns"];
};

export type DimensionFilterInput<TDimension = ColumnReferenceInput> = {
  dimension: TDimension;
  operator: FilterOperator;
  value?: unknown;
  values?: readonly unknown[];
};
