import type {
  SdkQuestionId,
  SqlParameterValues,
} from "embedding-sdk-bundle/types";
import type { TemporalUnit } from "metabase-types/api";

import type {
  FieldSchema,
  InferSchema,
  MetricDimensionSchema,
  QueryData,
  QuestionSchema,
  SchemaColumn,
  SchemaJavaScriptType,
  SchemaValue,
  TableSchema,
} from "../data-schema";

export type ID = string | number;
type Values<T> = T[keyof T];
type UnionToIntersection<TUnion> = (
  TUnion extends unknown ? (value: TUnion) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never;

type FieldValues<TEntity> = TEntity extends {
  fields?: infer TFields;
}
  ? NonNullable<TFields> extends readonly FieldSchema[]
    ? NonNullable<TFields>[number]
    : Values<NonNullable<TFields>>
  : never;

type MetricDimensionValues<TEntity> = TEntity extends {
  dimensions?: infer TDimensions;
}
  ? NonNullable<TDimensions> extends readonly MetricDimensionSchema[]
    ? NonNullable<TDimensions>[number]
    : Values<NonNullable<TDimensions>>
  : never;

type DimensionValues<TEntity> =
  | FieldValues<TEntity>
  | MetricDimensionValues<TEntity>;

type DimensionInput<TEntity> = [DimensionValues<TEntity>] extends [never]
  ? string | FieldSchema | MetricDimensionSchema
  : DimensionValues<TEntity>;

export type MetricReference<TMappedTableId extends number = number> = {
  id: ID;
  databaseId?: ID;
  sourceTableId?: ID;
  mappedTableIds: readonly TMappedTableId[];
  columns?: readonly SchemaColumn[];
  dimensions?: Record<string, MetricDimensionSchema>;
};

export type SegmentReference<TTableId extends number = number> = {
  kind: "segment";
  id: number;
  tableId: TTableId;
};

export type MeasureReference<TTableId extends number = number> = {
  kind: "measure";
  id: number;
  tableId: TTableId;
  columns?: readonly SchemaColumn[];
};

export type CountAggregation = {
  type: "count";
};

export type CountAggregationSchema = CountAggregation & {
  columns: readonly [
    {
      name: "count";
      displayName: "Count";
      jsType: "number";
    },
  ];
};

type CountAggregationColumn = CountAggregationSchema["columns"][number];

export type FieldAggregationOperator =
  | "sum"
  | "avg"
  | "median"
  | "distinct"
  | "min"
  | "max";

export type FieldAggregation<
  TOperator extends FieldAggregationOperator = FieldAggregationOperator,
  TDimension = unknown,
> = {
  type: TOperator;
  dimension: TDimension;
};

type AggregationDimensionWithJavaScriptType<
  TDimension,
  TJavaScriptType extends SchemaJavaScriptType,
> = TDimension extends unknown
  ? TDimension extends { jsType?: infer TDimensionJavaScriptType }
    ? Extract<
        NonNullable<TDimensionJavaScriptType>,
        TJavaScriptType
      > extends never
      ? never
      : TDimension
    : TDimension
  : never;

export type NumericAggregationDimension<TDimension> =
  AggregationDimensionWithJavaScriptType<TDimension, "number">;

export type OrderableAggregationDimension<TDimension> =
  AggregationDimensionWithJavaScriptType<
    TDimension,
    "string" | "number" | "boolean" | "Date"
  >;

type FieldAggregationColumnJavaScriptType<
  TOperator extends FieldAggregationOperator,
  TDimension,
> = TOperator extends "min" | "max"
  ? TDimension extends { jsType?: infer TJavaScriptType }
    ? Extract<
        NonNullable<TJavaScriptType>,
        "string" | "number" | "boolean" | "Date"
      > extends never
      ? "number"
      : Extract<
          NonNullable<TJavaScriptType>,
          "string" | "number" | "boolean" | "Date"
        >
    : "number"
  : "number";

type FieldAggregationColumnName<TOperator extends FieldAggregationOperator> =
  TOperator extends "distinct" ? "count" : TOperator;

export type FieldAggregationSchema<
  TOperator extends FieldAggregationOperator = FieldAggregationOperator,
  TDimension = unknown,
  TJavaScriptType extends SchemaJavaScriptType =
    FieldAggregationColumnJavaScriptType<TOperator, TDimension>,
> = FieldAggregation<TOperator, TDimension> & {
  columns: readonly [
    {
      name: FieldAggregationColumnName<TOperator>;
      displayName: string;
      jsType: TJavaScriptType;
    },
  ];
};

type AnyAggregation<TDimension = unknown> =
  | CountAggregation
  | CountAggregationSchema
  | FieldAggregation<FieldAggregationOperator, TDimension>
  | FieldAggregationSchema<FieldAggregationOperator, TDimension>;

type TableId<TTable> = TTable extends { id: infer TId extends number }
  ? TId
  : number;

type MappedTableId<TMetric> = TMetric extends {
  mappedTableIds?: readonly number[];
}
  ? NonNullable<TMetric["mappedTableIds"]>[number]
  : number;

type MetricEntityId<TMetric> = TMetric extends { id: infer TId extends ID }
  ? TId
  : ID;

type MetricDimensionReference<TMetricId extends ID = ID> =
  MetricDimensionSchema & {
    metricId: TMetricId;
  };

type TableFieldReference<TTableId extends number = number> = FieldSchema & {
  tableId: TTableId;
};

type SegmentForMetric<TMetric> = SegmentReference<MappedTableId<TMetric>>;

type MeasureForMetric<TMetric> = MeasureReference<MappedTableId<TMetric>>;

type MetricDimensionFilterForMetric<TMetric> = [
  MetricDimensionValues<TMetric>,
] extends [never]
  ? MetabaseMetricDimensionFilter
  : MetabaseDimensionFilterForDimension<MetricDimensionValues<TMetric>>;

type TableDimensionFilterForMetric<TMetric> =
  MetabaseDimensionFilterForDimension<
    TableFieldReference<MappedTableId<TMetric>>
  >;

type TableBreakoutForMetric<TMetric> = MetabaseBreakoutObjectForDimension<
  TableFieldReference<MappedTableId<TMetric>>
>;

type MetricBreakoutForMetric<TMetric> = [
  MetricDimensionValues<TMetric>,
] extends [never]
  ? MetabaseMetricBreakout
  : MetabaseBreakoutObjectForDimension<
      MetricDimensionReference<MetricEntityId<TMetric>>
    >;

type BreakoutForMetric<TMetric> =
  | MetricBreakoutForMetric<TMetric>
  | TableBreakoutForMetric<TMetric>;

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

type UnaryFilterOperator = "is-empty" | "not-empty" | "is-null" | "not-null";

type BetweenFilterOperator = "between";

type StringFilterOperator =
  | "="
  | "!="
  | "contains"
  | "does-not-contain"
  | "starts-with"
  | "ends-with"
  | "is-empty"
  | "not-empty"
  | "is-null"
  | "not-null";

type NumberFilterOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "between"
  | "is-null"
  | "not-null";

type BooleanFilterOperator = "=" | "is-null" | "not-null";

type DateFilterOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "between"
  | "time-interval"
  | "is-null"
  | "not-null";

type FilterOperatorForDimension<TDimension> = TDimension extends {
  jsType?: infer TJavaScriptType;
}
  ? NonNullable<TJavaScriptType> extends "string"
    ? StringFilterOperator
    : NonNullable<TJavaScriptType> extends "number"
      ? NumberFilterOperator
      : NonNullable<TJavaScriptType> extends "boolean"
        ? BooleanFilterOperator
        : NonNullable<TJavaScriptType> extends "Date"
          ? DateFilterOperator
          : FilterOperator
  : FilterOperator;

export type UnaryFilterOperatorForDimension<TDimension> = Extract<
  FilterOperatorForDimension<TDimension>,
  UnaryFilterOperator
>;

export type BetweenFilterOperatorForDimension<TDimension> = Extract<
  FilterOperatorForDimension<TDimension>,
  BetweenFilterOperator
>;

export type ValueFilterOperatorForDimension<TDimension> = Exclude<
  FilterOperatorForDimension<TDimension>,
  UnaryFilterOperator | BetweenFilterOperator
>;

type MetabaseDimensionFilterForDimension<TDimension> =
  TDimension extends unknown
    ? {
        dimension: TDimension;
        operator: FilterOperatorForDimension<TDimension>;
        value?: unknown;
        values?: readonly unknown[];
      }
    : never;

/** @notExported FilterOperatorForDimension */
export type MetabaseDimensionFilterForOperator<
  TDimension,
  TOperator extends FilterOperatorForDimension<TDimension>,
> = {
  dimension: TDimension;
  operator: TOperator;
  value?: unknown;
  values?: readonly unknown[];
};

type BreakoutBinning = {
  strategy: "default" | "bin-width" | "num-bins";
  "bin-width"?: number;
  "num-bins"?: number;
};

type DateBucketDimension<TDimension> = TDimension extends unknown
  ? TDimension extends { jsType?: infer TJavaScriptType }
    ? "Date" extends NonNullable<TJavaScriptType>
      ? TDimension
      : never
    : TDimension
  : never;

type NonDateBucketDimension<TDimension> = TDimension extends unknown
  ? TDimension extends { jsType?: infer TJavaScriptType }
    ? "Date" extends NonNullable<TJavaScriptType>
      ? never
      : TDimension
    : never
  : never;

/**
 * @notExported BreakoutBinning
 * @notExported DateBucketDimension
 */
export type BreakoutOptionsArgument<TDimension> = [
  DateBucketDimension<TDimension>,
] extends [never]
  ? {
      binning?: BreakoutBinning;
    }
  : {
      bucket?: TemporalUnit;
      binning?: BreakoutBinning;
    };

type MetabaseBreakoutForDimension<TDimension> =
  | TDimension
  | MetabaseBreakoutObjectForDimension<TDimension>;

type MetabaseBreakoutObjectForDimension<TDimension> =
  | ([DateBucketDimension<TDimension>] extends [never]
      ? never
      : {
          dimension: DateBucketDimension<TDimension>;
          bucket?: TemporalUnit;
          binning?: BreakoutBinning;
        })
  | ([NonDateBucketDimension<TDimension>] extends [never]
      ? never
      : {
          dimension: NonDateBucketDimension<TDimension>;
          binning?: BreakoutBinning;
        });

/**
 * @notExported DimensionInput
 * @notExported DimensionValues
 * @notExported MetabaseBreakoutForDimension
 */
export type MetabaseBreakout<TEntity = unknown> = [
  DimensionValues<TEntity>,
] extends [never]
  ?
      | DimensionInput<TEntity>
      | {
          dimension: DimensionInput<TEntity>;
          bucket?: TemporalUnit;
          binning?: {
            strategy: "default" | "bin-width" | "num-bins";
            "bin-width"?: number;
            "num-bins"?: number;
          };
        }
  : MetabaseBreakoutForDimension<DimensionValues<TEntity>>;

/**
 * @notExported DimensionInput
 * @notExported DimensionValues
 * @notExported MetabaseDimensionFilterForDimension
 */
export type MetabaseDimensionFilter<TEntity = unknown> = [
  DimensionValues<TEntity>,
] extends [never]
  ? {
      dimension: DimensionInput<TEntity>;
      operator: FilterOperator;
      value?: unknown;
      values?: readonly unknown[];
    }
  : MetabaseDimensionFilterForDimension<DimensionValues<TEntity>>;

export type MetabaseMetricBreakout<TDimension = MetricDimensionSchema> =
  MetabaseBreakoutForDimension<TDimension>;

export type MetabaseMetricDimensionFilter =
  MetabaseDimensionFilterForDimension<MetricDimensionSchema>;

export type QuestionQuery<TQuestion> = {
  questionId: SdkQuestionId;
  table?: never;
  tableId?: never;
  metricId?: never;
  metric?: never;
  parameters?: TQuestion extends QuestionSchema
    ? SqlParameterValues
    : SqlParameterValues;
  enabled?: boolean;
};

type TableReference<TTable> =
  | {
      table: TTable extends TableSchema ? TTable : TableSchema;
      tableId?: never;
      databaseId?: never;
    }
  | {
      table?: never;
      tableId: ID;
      databaseId?: ID;
    };

export type TableQuery<TTable> = TableReference<TTable> & {
  questionId?: never;
  metricId?: never;
  metric?: never;
  filters?: TTable extends TableSchema
    ? readonly (
        | SegmentReference<TableId<TTable>>
        | MetabaseDimensionFilter<TTable>
      )[]
    : readonly unknown[];
  aggregations?: TTable extends TableSchema
    ? readonly (
        | MeasureReference<TableId<TTable>>
        | AnyAggregation<FieldValues<TTable>>
      )[]
    : readonly (MeasureReference | AnyAggregation)[];
  measures?: TTable extends TableSchema
    ? readonly MeasureReference<TableId<TTable>>[]
    : readonly MeasureReference[];
  breakouts?: TTable extends TableSchema
    ? readonly MetabaseBreakout<TTable>[]
    : readonly MetabaseBreakout[];
  enabled?: boolean;
};

export type MetricQuery<TMetric> = {
  metric: TMetric extends MetricReference
    ? MetricReference<MappedTableId<TMetric>>
    : MetricReference;
  questionId?: never;
  table?: never;
  tableId?: never;
  metricId?: never;
  filters?: TMetric extends MetricReference
    ? readonly (
        | SegmentForMetric<TMetric>
        | MetricDimensionFilterForMetric<TMetric>
        | TableDimensionFilterForMetric<TMetric>
      )[]
    : readonly unknown[];
  measures?: TMetric extends MetricReference
    ? readonly MeasureForMetric<TMetric>[]
    : readonly MeasureReference[];
  breakouts?: TMetric extends MetricReference
    ? readonly BreakoutForMetric<TMetric>[]
    : readonly MetabaseBreakout[];
  enabled?: boolean;
};

/**
 * @internal
 * @notExported MeasureReference
 * @notExported QuestionQuery
 * @notExported TableQuery
 * @notExported MetricQuery
 */
export type MetabaseQueryOptions<TEntity = unknown, _TSchema = unknown> =
  | QuestionQuery<TEntity>
  | TableQuery<TEntity>
  | MetricQuery<TEntity>;

type EmptyRow = Record<never, never>;

type ColumnRow<TColumn> = TColumn extends SchemaColumn
  ? { [TName in TColumn["name"]]: SchemaValue<TColumn> }
  : EmptyRow;

type RowsFromColumns<TColumn> = [TColumn] extends [never]
  ? EmptyRow
  : UnionToIntersection<TColumn extends unknown ? ColumnRow<TColumn> : never>;

type BreakoutDimension<TBreakout> = TBreakout extends {
  dimension: infer TDimension;
}
  ? TDimension
  : TBreakout;

type TupleElement<TValue> = TValue extends readonly unknown[]
  ? number extends TValue["length"]
    ? never
    : TValue[number]
  : never;

type QueryBreakoutColumns<TQuery> = TQuery extends {
  breakouts?: infer TBreakouts;
}
  ? BreakoutDimension<TupleElement<NonNullable<TBreakouts>>>
  : never;

type QueryMeasureColumns<TQuery> = TQuery extends {
  measures?: infer TMeasures;
}
  ? TupleElement<NonNullable<TMeasures>> extends {
      columns: infer TColumns;
    }
    ? TupleElement<NonNullable<TColumns>>
    : never
  : never;

type QueryAggregationColumns<TQuery> = TQuery extends {
  aggregations?: infer TAggregations;
}
  ? TupleElement<NonNullable<TAggregations>> extends infer TAggregation
    ? TAggregation extends {
        columns: infer TColumns;
      }
      ? TupleElement<NonNullable<TColumns>>
      : TAggregation extends CountAggregation
        ? CountAggregationColumn
        : TAggregation extends FieldAggregationSchema
          ? TupleElement<NonNullable<TAggregation["columns"]>>
          : TAggregation extends FieldAggregation<infer TOperator>
            ? FieldAggregationSchema<TOperator>["columns"][number]
            : never
    : never
  : never;

type QueryDefaultAggregationColumns<TQuery> =
  "aggregations" extends keyof TQuery
    ? never
    : "measures" extends keyof TQuery
      ? never
      : TQuery extends { breakouts: readonly unknown[] }
        ? CountAggregationColumn
        : never;

/** @notExported InferQuerySchema */
type InferQuerySchema<TEntity, TQuery> = InferSchema<
  TEntity,
  Record<string, unknown>
> &
  RowsFromColumns<
    | QueryBreakoutColumns<TQuery>
    | QueryMeasureColumns<TQuery>
    | QueryAggregationColumns<TQuery>
    | QueryDefaultAggregationColumns<TQuery>
  >;

type InferQueryEntity<TQuery> = TQuery extends { metric: infer TMetric }
  ? TMetric
  : TQuery extends { table: infer TTable }
    ? TTable
    : undefined;

type QueryEntity<TEntity, TQuery> = [TEntity] extends [undefined]
  ? InferQueryEntity<TQuery>
  : TEntity;

/**
 * @internal
 * @notExported InferQuerySchema
 * @notExported QueryData
 */
export type UseMetabaseQueryResult<TEntity = unknown, TQuery = unknown> = {
  data: QueryData<InferQuerySchema<TEntity, TQuery>> | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<void>;
};

/**
 * @internal
 * @notExported QueryEntity
 * @notExported QuestionSchema
 * @notExported TableSchema
 */
export type UseMetabaseQuery = <
  TEntity extends QuestionSchema | TableSchema | MetricReference | undefined =
    undefined,
  TSchema = unknown,
  const TQuery = unknown,
>(
  query: TQuery & MetabaseQueryOptions<QueryEntity<TEntity, TQuery>, TSchema>,
) => UseMetabaseQueryResult<QueryEntity<TEntity, TQuery>, TQuery>;
