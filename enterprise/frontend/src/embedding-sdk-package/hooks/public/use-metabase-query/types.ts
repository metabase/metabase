import type {
  BooleanFilterOperator,
  DefaultFilterOperator,
  ExcludeDateFilterOperator,
  FilterOperator as LibFilterOperator,
  StringFilterOperator as LibStringFilterOperator,
  NumberFilterOperator,
  SpecificDateFilterOperator,
  TimeFilterOperator,
} from "metabase-lib/common";
import type { TemporalUnit } from "metabase-types/api";

import type {
  FieldSchema,
  InferSchema,
  MetricSchema,
  QueryData,
  QuestionSchema,
  SchemaColumn,
  SchemaJavaScriptType,
  SchemaValue,
  TableSchema,
} from "../data-schema";

type Values<T> = T[keyof T];
type UnionToIntersection<TUnion> = (
  TUnion extends unknown ? (value: TUnion) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never;

type FieldValues<TEntity> = TEntity extends {
  fields?: infer TFields;
}
  ? Values<NonNullable<TFields>>
  : never;

type FieldNames<TEntity> =
  FieldValues<TEntity> extends { name: infer TName } ? TName : string;

type SegmentIds<TEntity> = TEntity extends { segments?: infer TSegments }
  ? Values<NonNullable<TSegments>> extends { id: infer TId }
    ? TId
    : never
  : never;

type MeasureIds<TEntity> = TEntity extends { measures?: infer TMeasures }
  ? Values<NonNullable<TMeasures>> extends { id: infer TId }
    ? TId
    : never
  : never;

type SourceQuerySpec<TTable> = {
  type: "table";
  id: TTable extends { id: infer TId extends number } ? TId : number;
};

type TableId<TTable> = TTable extends { id: infer TId extends number }
  ? TId
  : number;

export type SegmentReference<TTable = unknown> = {
  type: "segment";
  id: [SegmentIds<TTable>] extends [never] ? number : SegmentIds<TTable>;
  tableId?: TableId<TTable>;
};

export type MeasureReference<TTable = unknown> = {
  type: "measure";
  id: [MeasureIds<TTable>] extends [never] ? number : MeasureIds<TTable>;
  tableId?: TableId<TTable>;
  columns?: readonly SchemaColumn[];
};

/**
 * Metrics with table source emits `sourceTableId`. Its `mappedTableIds` can include
 * joined tables exposed by generated dimensions, so once `sourceTableId` matches the
 * source table, `mappedTableIds` must stay wider than the source table id.
 *
 * The second branch is a fallback for Metric metadata without `sourceTableId`.
 * In that shape, `mappedTableIds` is the only available compile-time proof,
 * so each mapped id must match the query source table.
 */
export type MetricReference<TTable = unknown> = Omit<
  MetricSchema,
  "mappedTableIds" | "sourceCardId" | "sourceTableId"
> & {
  type: "metric";

  // Metrics based on saved questions are not yet supported
  // TODO(EMB-2045): add support for saved questions as metric sources
  sourceCardId?: never;
} & (
    | {
        sourceTableId: TableId<TTable>;
        mappedTableIds?: readonly number[];
      }
    | {
        sourceTableId?: TableId<TTable>;
        mappedTableIds: readonly TableId<TTable>[];
      }
  );

type LocalFieldReference<TTable = unknown> = Omit<
  FieldSchema,
  "sourceFieldId" | "tableId"
> & {
  type: "column";
  name: [FieldNames<TTable>] extends [never] ? string : FieldNames<TTable>;
  tableId: TableId<TTable>;

  // Fields with `sourceFieldId` are FK-joined dimensions; keep them out of the
  // "local source table" branch so table ownership checks stay strict.
  sourceFieldId?: never;
};

type JoinedFieldReference = Omit<FieldSchema, "sourceFieldId" | "tableId"> & {
  type: "column";
  sourceFieldId: number;

  // Joined fields are scoped through the source FK field, not by declaring
  // themselves as fields on the query's source table.
  tableId?: never;
};

export type FieldReference<TTable = unknown> =
  | LocalFieldReference<TTable>
  | JoinedFieldReference;

export type CountAggregation = {
  type: "operator";
  operator: "count";
  args: [];
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
  type: "operator";
  operator: TOperator;
  args: readonly [TDimension];
};

export type FieldAggregationSchema<
  TOperator extends FieldAggregationOperator = FieldAggregationOperator,
  TDimension = unknown,
  TJavaScriptType extends SchemaJavaScriptType = "number",
> = FieldAggregation<TOperator, TDimension> & {
  columns: readonly [
    {
      name: TOperator extends "distinct" ? "count" : TOperator;
      displayName: string;
      jsType: TJavaScriptType;
    },
  ];
};

type AnyAggregation<TTable = unknown> =
  | CountAggregation
  | CountAggregationSchema
  | FieldAggregation<FieldAggregationOperator, FieldReference<TTable>>
  | FieldAggregationSchema<FieldAggregationOperator, FieldReference<TTable>>
  | MeasureReference<TTable>
  | MetricReference<TTable>;

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

export type FilterOperator =
  | Exclude<LibFilterOperator, "inside">
  | "time-interval";

type UnaryFilterOperator = "is-empty" | "not-empty" | "is-null" | "not-null";
type BetweenFilterOperator = "between";
type StringFilterOperator = LibStringFilterOperator | DefaultFilterOperator;
type DateFilterOperator =
  | SpecificDateFilterOperator
  | ExcludeDateFilterOperator
  | TimeFilterOperator
  | ">="
  | "<="
  | "time-interval";

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

export type MetabaseDimensionFilterForOperator<
  TDimension,
  TOperator extends FilterOperatorForDimension<TDimension>,
> = {
  type: "operator";
  operator: TOperator;
  args: readonly [
    TDimension,
    ...{
      type: "literal";
      value: FilterLiteralValue;
    }[],
  ];
};

type MetabaseDimensionFilterForDimension<TDimension> =
  TDimension extends unknown
    ? {
        type: "operator";
        operator: FilterOperatorForDimension<TDimension>;
        args: readonly [
          TDimension,
          ...{
            type: "literal";
            value: FilterLiteralValue;
          }[],
        ];
      }
    : never;

export type MetabaseDimensionFilter<TEntity = unknown> =
  MetabaseDimensionFilterForDimension<FieldReference<TEntity>>;

export type FilterLiteralValue = string | number | bigint | boolean;

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

export type BreakoutOptionsArgument<TDimension> = [
  DateBucketDimension<TDimension>,
] extends [never]
  ? { binning?: BinningOptions } & BinningOptionsInput
  : { unit?: TemporalUnit; binning?: BinningOptions } & BinningOptionsInput;

export type MetabaseBreakoutObjectForDimension<TDimension> =
  | ([DateBucketDimension<TDimension>] extends [never]
      ? never
      : DateBucketDimension<TDimension> & {
          unit?: TemporalUnit;
          binning?: BinningOptions;
        } & BinningOptionsInput)
  | ([NonDateBucketDimension<TDimension>] extends [never]
      ? never
      : NonDateBucketDimension<TDimension> & {
          binning?: BinningOptions;
        } & BinningOptionsInput);

export type MetabaseBreakout<TTable = unknown> =
  | FieldReference<TTable>
  | MetabaseBreakoutObjectForDimension<FieldReference<TTable>>;

export type OrderByDirection = "asc" | "desc";

type MetabaseOrderByObjectForDimension<TDimension> =
  MetabaseBreakoutObjectForDimension<TDimension> & {
    direction?: OrderByDirection;
  };

export type MetabaseOrderBy<TTable = unknown> =
  | (FieldReference<TTable> & { direction?: OrderByDirection })
  | MetabaseOrderByObjectForDimension<FieldReference<TTable>>
  | AggregationResultOrderBy;

type AggregationResultOrderBy = {
  type: "column";
  name: string;
  direction?: OrderByDirection;
};

type BinningOptionsInput =
  | { bins?: number | "auto"; binWidth?: never }
  | { binWidth?: number | "auto"; bins?: never };

export type BinningOptions =
  | { strategy: "default" }
  | { strategy: "num-bins"; "num-bins": number }
  | { strategy: "bin-width"; "bin-width": number };

type TableQueryBase<TTable> = {
  source: TTable extends TableSchema ? SourceQuerySpec<TTable> : TableSchema;
  fields?: readonly FieldReference<TTable>[];
  filters?: readonly (
    | SegmentReference<TTable>
    | MetabaseDimensionFilterForDimension<FieldReference<TTable>>
  )[];
  orderBys?: readonly MetabaseOrderBy<TTable>[];
  limit?: number;
  enabled?: boolean;
} & (
  | {
      breakouts?: undefined;
      aggregations?: readonly AnyAggregation<TTable>[];
    }
  | {
      breakouts: readonly MetabaseBreakout<TTable>[];
      aggregations: readonly [
        AnyAggregation<TTable>,
        ...AnyAggregation<TTable>[],
      ];
    }
);

export type QuestionQuery<TQuestion = unknown> = {
  source: TQuestion extends QuestionSchema ? TQuestion : QuestionSchema;
  fields?: never;
  filters?: never;
  aggregations?: never;
  breakouts?: never;
  orderBys?: never;
  limit?: never;
  enabled?: boolean;
};

type RequireAggregationsForBreakouts<TQuery> = TQuery extends {
  breakouts: readonly [unknown, ...unknown[]];
}
  ? TQuery extends { aggregations: readonly [unknown, ...unknown[]] }
    ? unknown
    : { aggregations: readonly [unknown, ...unknown[]] }
  : unknown;

export type TableQuery<TTable, TQuery = unknown> = TableQueryBase<TTable> &
  RequireAggregationsForBreakouts<TQuery>;

export type MetabaseQueryOptions<TEntity = unknown, _TSchema = unknown> = [
  TEntity,
] extends [undefined]
  ? TableQuery<TEntity> | QuestionQuery<TEntity>
  : TEntity extends QuestionSchema
    ? QuestionQuery<TEntity>
    : TableQuery<TEntity>;

type EmptyRow = Record<never, never>;

type ColumnRow<TColumn> = TColumn extends SchemaColumn
  ? string extends TColumn["name"]
    ? EmptyRow
    : { [TName in TColumn["name"]]: SchemaValue<TColumn> }
  : EmptyRow;

type RowsFromColumns<TColumn> = [TColumn] extends [never]
  ? EmptyRow
  : UnionToIntersection<TColumn extends unknown ? ColumnRow<TColumn> : never>;

type TupleElement<TValue> = TValue extends readonly unknown[]
  ? TValue[number]
  : never;

type QueryFieldColumns<TQuery> = TQuery extends { fields?: infer TFields }
  ? TupleElement<NonNullable<TFields>>
  : never;

type QueryBreakoutColumns<TQuery> = TQuery extends {
  breakouts?: infer TBreakouts;
}
  ? TupleElement<NonNullable<TBreakouts>>
  : never;

type QueryAggregationColumns<TQuery> = TQuery extends {
  aggregations?: infer TAggregations;
}
  ? TupleElement<NonNullable<TAggregations>> extends infer TAggregation
    ? TAggregation extends { columns: infer TColumns }
      ? TupleElement<NonNullable<TColumns>>
      : TAggregation extends CountAggregation
        ? CountAggregationColumn
        : never
    : never
  : never;

type DefaultTableColumns<TEntity, TQuery> = TQuery extends { fields: unknown }
  ? never
  : TQuery extends { aggregations: unknown }
    ? never
    : TQuery extends { breakouts: unknown }
      ? never
      : TEntity extends { fields?: infer TFields }
        ? Values<NonNullable<TFields>>
        : never;

type InferQuerySchema<TEntity, TQuery> = InferSchema<TEntity, EmptyRow> &
  RowsFromColumns<
    | DefaultTableColumns<TEntity, TQuery>
    | QueryFieldColumns<TQuery>
    | QueryBreakoutColumns<TQuery>
    | QueryAggregationColumns<TQuery>
  >;

type InferQueryEntity<TQuery> = TQuery extends { source: infer TTable }
  ? TTable
  : undefined;

type QueryEntity<TEntity, TQuery> = [TEntity] extends [undefined]
  ? InferQueryEntity<TQuery>
  : TEntity;

export type UseMetabaseQueryResult<TEntity = unknown, TQuery = unknown> = {
  data: QueryData<InferQuerySchema<TEntity, TQuery>> | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<void>;
};

export type UseMetabaseQuery = <
  TEntity extends TableSchema | QuestionSchema | undefined = undefined,
  TSchema = unknown,
  const TQuery = MetabaseQueryOptions<TEntity, TSchema>,
>(
  query: TQuery &
    (TQuery extends MetabaseQueryOptions<TEntity, TSchema>
      ? TQuery extends { source: unknown }
        ? RequireAggregationsForBreakouts<TQuery>
        : unknown
      : MetabaseQueryOptions<TEntity, TSchema>),
) => UseMetabaseQueryResult<QueryEntity<TEntity, TQuery>, TQuery>;
