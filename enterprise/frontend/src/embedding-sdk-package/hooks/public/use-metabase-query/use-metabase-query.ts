import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { QueryDatasetResult } from "embedding-sdk-bundle/lib/query-dataset";
import type { QueryMetricResult } from "embedding-sdk-bundle/lib/query-metric";
import type { QueryQuestionResult } from "embedding-sdk-bundle/lib/query-question";
import type {
  SdkQuestionId,
  SqlParameterValues,
} from "embedding-sdk-bundle/types";
import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type {
  Aggregation,
  ConcreteFieldReference,
  FieldReference,
  Filter,
  MetricId,
  StructuredDatasetQuery,
} from "metabase-types/api";
import type {
  InstanceFilter,
  JsMetricDefinition,
  TypedProjection,
} from "metabase-types/api/metric";

import type {
  FieldSchema,
  InferSchema,
  MeasureSchema,
  MetricDimensionSchema,
  MetricSchema,
  QueryData,
  QuestionSchema,
  SchemaColumn,
  SchemaValue,
  SegmentSchema,
  TableSchema,
} from "../data-schema";
import { mapQueryData, mapRowsToObjects } from "../data-schema";

type ID = string | number;
type Values<T> = T[keyof T];
type UnionToIntersection<TUnion> = (
  TUnion extends unknown ? (value: TUnion) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never;

type SegmentValues<TEntity> = TEntity extends {
  segments?: infer TSegments;
}
  ? Values<NonNullable<TSegments>>
  : never;

type MeasureValues<TEntity> = TEntity extends {
  measures?: infer TMeasures;
}
  ? Values<NonNullable<TMeasures>>
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

type MappedTableId<TMetric> = TMetric extends {
  mappedTableIds?: readonly number[];
}
  ? NonNullable<TMetric["mappedTableIds"]>[number]
  : number;

type MappedTable<TMetric, TSchema> = Extract<
  TSchema extends { readonly tables: infer TTables } ? Values<TTables> : never,
  { readonly id: MappedTableId<TMetric> }
>;

type SegmentForMetric<TMetric, TSchema> = SegmentValues<
  MappedTable<TMetric, TSchema>
>;

type MeasureForMetric<TMetric, TSchema> = [
  MappedTable<TMetric, TSchema>,
] extends [never]
  ? MeasureSchema
  : MeasureValues<MappedTable<TMetric, TSchema>>;

type BreakoutForMetric<TMetric, TSchema> =
  | MetabaseMetricBreakout
  | MetabaseBreakout<MappedTable<TMetric, TSchema>>;

type MetricSource<TMetric> =
  | {
      metricId: ID;
      metric?: never;
    }
  | {
      metric: TMetric extends MetricSchema ? TMetric : MetricSchema;
      metricId?: never;
    };

type FilterOperator =
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

export type MetabaseBreakout<TEntity = unknown> =
  | DimensionInput<TEntity>
  | {
      dimension: DimensionInput<TEntity>;
      bucket?: string;
      binning?: {
        strategy: "default" | "bin-width" | "num-bins";
        "bin-width"?: number;
        "num-bins"?: number;
      };
    };

export type MetabaseDimensionFilter<TEntity = unknown> = {
  dimension: DimensionInput<TEntity>;
  operator: FilterOperator;
  value?: unknown;
  values?: readonly unknown[];
};

export type MetabaseMetricBreakout =
  | MetricDimensionSchema
  | {
      dimension: MetricDimensionSchema;
      bucket?: string;
      binning?: {
        strategy: "default" | "bin-width" | "num-bins";
        "bin-width"?: number;
        "num-bins"?: number;
      };
    };

export type MetabaseMetricDimensionFilter = Omit<
  MetabaseDimensionFilter,
  "dimension"
> & {
  dimension: MetricDimensionSchema;
};

type QuestionQuery<TQuestion> = {
  questionId: SdkQuestionId;
  tableId?: never;
  metricId?: never;
  parameters?: TQuestion extends QuestionSchema
    ? SqlParameterValues
    : SqlParameterValues;
  enabled?: boolean;
};

type TableQuery<TTable> = {
  tableId: ID;
  questionId?: never;
  metricId?: never;
  filters?: TTable extends TableSchema
    ? readonly (SegmentValues<TTable> | MetabaseDimensionFilter<TTable>)[]
    : readonly unknown[];
  measures?: TTable extends TableSchema
    ? readonly MeasureValues<TTable>[]
    : readonly unknown[];
  breakouts?: TTable extends TableSchema
    ? readonly MetabaseBreakout<TTable>[]
    : readonly MetabaseBreakout[];
  enabled?: boolean;
};

type MetricQuery<TMetric, TSchema> = MetricSource<TMetric> & {
  questionId?: never;
  tableId?: never;
  filters?: TMetric extends MetricSchema
    ? readonly (
        | SegmentForMetric<TMetric, TSchema>
        | MetabaseMetricDimensionFilter
        | MetabaseDimensionFilter<MappedTable<TMetric, TSchema>>
      )[]
    : readonly unknown[];
  measures?: TMetric extends MetricSchema
    ? readonly MeasureForMetric<TMetric, TSchema>[]
    : readonly unknown[];
  breakouts?: TMetric extends MetricSchema
    ? readonly BreakoutForMetric<TMetric, TSchema>[]
    : readonly MetabaseBreakout[];
  enabled?: boolean;
};

/**
 * @notExported QuestionQuery
 * @notExported TableQuery
 * @notExported MetricQuery
 */
export type MetabaseQueryOptions<TEntity, TSchema = unknown> =
  | QuestionQuery<TEntity>
  | TableQuery<TEntity>
  | MetricQuery<TEntity, TSchema>;

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

type InferQuerySchema<TEntity, TQuery> = InferSchema<
  TEntity,
  Record<string, unknown>
> &
  RowsFromColumns<QueryBreakoutColumns<TQuery> | QueryMeasureColumns<TQuery>>;

/** @notExported InferQuerySchema */
export type UseMetabaseQueryResult<TEntity = unknown, TQuery = unknown> = {
  data: QueryData<InferQuerySchema<TEntity, TQuery>> | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<void>;
};

export const useMetabaseQuery = <
  TEntity extends QuestionSchema | TableSchema | MetricSchema | undefined =
    undefined,
  TSchema = unknown,
  TQuery extends MetabaseQueryOptions<TEntity, TSchema> = MetabaseQueryOptions<
    TEntity,
    TSchema
  >,
>(
  query: TQuery,
): UseMetabaseQueryResult<TEntity, TQuery> => {
  const {
    state: {
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();

  const loginStatus = useLazySelector(
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.getLoginStatus,
  );

  const queryQuestion =
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.queryQuestion;
  const queryDataset = getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.queryDataset;
  const queryMetric = getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.queryMetric;

  const [data, setData] =
    useState<UseMetabaseQueryResult<TEntity, TQuery>["data"]>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const queryKey = useMemo(() => JSON.stringify(query), [query]);
  const queryRef = useRef(query);

  useEffect(() => {
    queryRef.current = query;
  }, [query, queryKey]);

  const refetch = useCallback(async () => {
    const currentQuery = queryRef.current;

    if (currentQuery.enabled === false) {
      return;
    }

    if (!reduxStore) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      if (isQuestionQuery(currentQuery)) {
        if (!queryQuestion) {
          return;
        }

        const result = await queryQuestion(reduxStore)({
          questionId: currentQuery.questionId,
          initialSqlParameters: currentQuery.parameters,
        });

        setData(mapQueryData(result));
        return;
      }

      if (isTableQuery(currentQuery)) {
        if (!queryDataset) {
          return;
        }

        const result = await queryDataset(reduxStore)({
          datasetQuery: buildTableDatasetQuery(currentQuery),
        });

        setData(mapDatasetQueryData(result));
        return;
      }

      if (isMetricQuery(currentQuery)) {
        if (hasMeasures(currentQuery)) {
          if (!queryDataset) {
            return;
          }

          const result = await queryDataset(reduxStore)({
            datasetQuery: buildMetricDatasetQuery(currentQuery),
          });

          setData(mapDatasetQueryData(result));
          return;
        }

        if (!queryMetric) {
          return;
        }

        const definition = buildMetricDefinition(currentQuery);
        const result = await queryMetric(reduxStore)({ definition });

        setData(mapDatasetQueryData(result));
      }
    } catch (err) {
      setError(err);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [queryDataset, queryMetric, queryQuestion, reduxStore]);

  useEffect(() => {
    if (loginStatus?.status === "success") {
      refetch();
    }
  }, [loginStatus?.status, queryKey, refetch]);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
};

function buildTableDatasetQuery(
  query: TableQuery<unknown>,
): Omit<StructuredDatasetQuery, "database"> {
  validateTableScopedInputs({
    allowedTableIds: [Number(query.tableId)],
    filters: query.filters,
    measures: query.measures,
    context: "Table query",
  });

  const mbql: StructuredDatasetQuery["query"] = {
    "source-table": Number(query.tableId),
  };

  const filters = query.filters?.map(buildTableFilter).filter(Boolean);
  const measures = query.measures?.map(buildMeasureClause).filter(isNotNull);
  const breakouts = query.breakouts?.map(buildTableBreakout).filter(Boolean);

  if (filters?.length === 1) {
    mbql.filter = filters[0] as Filter;
  } else if (filters && filters.length > 1) {
    mbql.filter = ["and", ...(filters as Filter[])];
  }

  if (measures?.length) {
    mbql.aggregation = measures;
  }

  if (breakouts?.length) {
    mbql.breakout = breakouts;
  }

  return {
    type: "query",
    query: mbql,
    parameters: [],
  };
}

function isQuestionQuery(
  query: MetabaseQueryOptions<unknown, unknown>,
): query is QuestionQuery<unknown> {
  return query.questionId != null;
}

function isTableQuery(
  query: MetabaseQueryOptions<unknown, unknown>,
): query is TableQuery<unknown> {
  return query.tableId != null;
}

function isMetricQuery(
  query: MetabaseQueryOptions<unknown, unknown>,
): query is MetricQuery<unknown, unknown> {
  return getMetricId(query) != null;
}

function hasMeasures(
  query: MetricQuery<unknown, unknown>,
): query is MetricQuery<unknown, unknown> & { measures: readonly unknown[] } {
  return Array.isArray(query.measures) && query.measures.length > 0;
}

function buildTableFilter(filter: unknown) {
  if (isSegmentSchema(filter)) {
    return ["segment", filter.id];
  }

  if (isDimensionFilter(filter)) {
    return buildFieldFilterClause(filter);
  }

  return null;
}

function buildMeasureClause(measure: unknown): Aggregation | null {
  if (!isMeasureSchema(measure)) {
    return null;
  }

  return ["measure", {}, measure.id] as Aggregation;
}

function buildMetricDatasetQuery(
  query: MetricQuery<unknown, unknown> & { measures: readonly unknown[] },
): Omit<StructuredDatasetQuery, "database"> {
  const measures = query.measures.filter(isMeasureSchema);
  const sourceTableId = getMeasureSourceTableId(query, measures);
  const metricId = Number(getMetricId(query)) as MetricId;

  validateMetricTableScopedInputs(query);

  const mbql: StructuredDatasetQuery["query"] = {
    "source-table": sourceTableId,
    aggregation: [
      ["metric", metricId] as Aggregation,
      ...measures.map(buildMeasureClause).filter(isNotNull),
    ],
  };

  const filters = query.filters?.map(buildTableFilter).filter(Boolean);
  const breakouts = query.breakouts?.map(buildTableBreakout).filter(Boolean);

  if (filters?.length === 1) {
    mbql.filter = filters[0] as Filter;
  } else if (filters && filters.length > 1) {
    mbql.filter = ["and", ...(filters as Filter[])];
  }

  if (breakouts?.length) {
    mbql.breakout = breakouts;
  }

  return {
    type: "query",
    query: mbql,
    parameters: [],
  };
}

function getMeasureSourceTableId(
  query: MetricQuery<unknown, unknown>,
  measures: MeasureSchema[],
) {
  const [firstMeasure] = measures;

  if (!firstMeasure) {
    throw new Error(
      "Metric queries with measures require at least one generated measure object.",
    );
  }

  const tableId = firstMeasure.tableId;
  const hasMismatchedMeasure = measures.some((measure) => {
    return measure.tableId !== tableId;
  });

  if (hasMismatchedMeasure) {
    throw new Error("Metric query measures must belong to the same table.");
  }

  validateGeneratedTableId({
    tableId,
    allowedTableIds: getMetricMappedTableIds(query),
    context: "Metric query measures",
  });

  return tableId;
}

function buildTableBreakout(
  breakout: MetabaseBreakout,
): ConcreteFieldReference {
  const { dimension, options } = normalizeBreakout(breakout);

  return buildFieldReference(dimension, options) as ConcreteFieldReference;
}

function buildMetricDefinition(query: MetricQuery<unknown, unknown>) {
  validateMetricTableScopedInputs(query);

  const metricId = Number(getMetricId(query)) as MetricId;
  const uuid = "metric";
  const definition: JsMetricDefinition = {
    expression: ["metric", { "lib/uuid": uuid }, metricId],
  };

  const filters = query.filters?.map((filter): InstanceFilter | null => {
    if (isSegmentSchema(filter)) {
      return {
        "lib/uuid": uuid,
        filter: ["segment", {}, filter.id],
      };
    }

    if (isMetricDimensionFilter(filter)) {
      return {
        "lib/uuid": uuid,
        filter: buildMetricFilterClause(filter),
      };
    }

    return null;
  });

  const compactFilters = filters?.filter(Boolean) as InstanceFilter[];

  if (compactFilters?.length) {
    definition.filters = compactFilters;
  }

  if (query.breakouts?.length) {
    definition.projections = [
      {
        type: "metric",
        id: metricId,
        "lib/uuid": uuid,
        projection: query.breakouts.map((breakout) => {
          return buildMetricBreakout(toMetricBreakout(breakout));
        }),
      } satisfies TypedProjection,
    ];
  }

  return definition;
}

function buildFieldFilterClause(filter: MetabaseDimensionFilter) {
  const operator = filter.operator;
  const dimension = buildFieldReference(filter.dimension);
  const values = filter.values ?? [filter.value];

  if (operator === "between") {
    return [operator, dimension, ...values.slice(0, 2)];
  }

  if (isUnaryOperator(operator)) {
    return [operator, dimension];
  }

  return [operator, dimension, ...values];
}

function buildMetricFilterClause(filter: MetabaseMetricDimensionFilter) {
  const operator = filter.operator;
  const dimension = buildMetricDimensionReference(filter.dimension);
  const values = filter.values ?? [filter.value];

  if (operator === "between") {
    return [operator, {}, dimension, ...values.slice(0, 2)];
  }

  if (isUnaryOperator(operator)) {
    return [operator, {}, dimension];
  }

  return [operator, {}, dimension, ...values];
}

function buildMetricBreakout(breakout: MetabaseMetricBreakout) {
  const { dimension, options } = normalizeBreakout(breakout);

  return buildMetricDimensionReference(dimension, options);
}

function buildFieldReference(
  field: string | FieldSchema | MetricDimensionSchema,
  options: Record<string, unknown> = {},
): FieldReference {
  if (isFieldSchema(field) && typeof field.fieldId === "number") {
    return ["field", field.fieldId, options] as FieldReference;
  }

  if (isFieldSchema(field) && typeof field.id === "number") {
    return ["field", field.id, options] as FieldReference;
  }

  return ["field", String(field), options] as FieldReference;
}

function buildMetricDimensionReference(
  dimension: string | FieldSchema | MetricDimensionSchema,
  options: Record<string, unknown> = {},
) {
  if (typeof dimension === "string") {
    throw new Error(
      "Metric query dimensions must use generated metric dimension objects, not dimension name strings.",
    );
  }

  return [
    "dimension",
    options,
    isFieldSchema(dimension) ? dimension.id : dimension,
  ];
}

function normalizeBreakout(breakout: MetabaseBreakout) {
  if (
    typeof breakout === "string" ||
    isFieldSchema(breakout) ||
    isMetricDimensionSchema(breakout)
  ) {
    return { dimension: breakout, options: {} };
  }

  const options: Record<string, unknown> = {};

  if (breakout.bucket) {
    options["temporal-unit"] = breakout.bucket;
  }

  if (breakout.binning) {
    options.binning = breakout.binning;
  }

  return { dimension: breakout.dimension, options };
}

function isUnaryOperator(operator: FilterOperator) {
  return (
    operator === "is-empty" ||
    operator === "not-empty" ||
    operator === "is-null" ||
    operator === "not-null"
  );
}

function isNotNull<TValue>(value: TValue | null): value is TValue {
  return value !== null;
}

function getMetricId(query: unknown): ID | null {
  if (typeof query !== "object" || query == null) {
    return null;
  }

  if ("metricId" in query && query.metricId != null) {
    return query.metricId as ID;
  }

  if ("metric" in query && isMetricSchema(query.metric)) {
    return query.metric.id;
  }

  return null;
}

function getMetricMappedTableIds(
  query: MetricQuery<unknown, unknown>,
): readonly number[] | null {
  return isMetricSchema(query.metric) && query.metric.mappedTableIds
    ? query.metric.mappedTableIds
    : null;
}

function validateMetricTableScopedInputs(query: MetricQuery<unknown, unknown>) {
  validateTableScopedInputs({
    allowedTableIds: getMetricMappedTableIds(query),
    filters: query.filters,
    measures: query.measures,
    context: "Metric query",
  });
}

function validateTableScopedInputs({
  allowedTableIds,
  filters,
  measures,
  context,
}: {
  allowedTableIds: readonly number[] | null;
  filters?: readonly unknown[];
  measures?: readonly unknown[];
  context: string;
}) {
  if (!allowedTableIds) {
    return;
  }

  filters?.forEach((filter) => {
    if (isSegmentSchema(filter)) {
      validateGeneratedTableId({
        tableId: filter.tableId,
        allowedTableIds,
        context: `${context} segments`,
      });
    }
  });

  measures?.forEach((measure) => {
    if (isMeasureSchema(measure)) {
      validateGeneratedTableId({
        tableId: measure.tableId,
        allowedTableIds,
        context: `${context} measures`,
      });
    }
  });
}

function validateGeneratedTableId({
  tableId,
  allowedTableIds,
  context,
}: {
  tableId: number;
  allowedTableIds: readonly number[] | null;
  context: string;
}) {
  if (!allowedTableIds || allowedTableIds.includes(tableId)) {
    return;
  }

  throw new Error(
    `${context} must belong to one of the query's mapped tables. Expected table id ${tableId} to be one of ${allowedTableIds.join(
      ", ",
    )}.`,
  );
}

function isDimensionFilter(value: unknown): value is MetabaseDimensionFilter {
  return typeof value === "object" && value != null && "dimension" in value;
}

function isMetricDimensionFilter(
  value: unknown,
): value is MetabaseMetricDimensionFilter {
  return isDimensionFilter(value) && isMetricDimensionSchema(value.dimension);
}

function toMetricBreakout(breakout: MetabaseBreakout): MetabaseMetricBreakout {
  if (isMetricDimensionSchema(breakout)) {
    return breakout;
  }

  if (
    typeof breakout === "object" &&
    breakout != null &&
    "dimension" in breakout &&
    isMetricDimensionSchema(breakout.dimension)
  ) {
    return breakout as MetabaseMetricBreakout;
  }

  throw new Error(
    "Metric query breakouts must use generated metric dimension objects, not dimension name strings.",
  );
}

function isSegmentSchema(value: unknown): value is SegmentSchema {
  return (
    typeof value === "object" &&
    value != null &&
    "kind" in value &&
    value.kind === "segment"
  );
}

function isMeasureSchema(value: unknown): value is MeasureSchema {
  return (
    typeof value === "object" &&
    value != null &&
    "kind" in value &&
    value.kind === "measure"
  );
}

function isMetricSchema(value: unknown): value is MetricSchema {
  return (
    typeof value === "object" &&
    value != null &&
    "id" in value &&
    "columns" in value
  );
}

function isFieldSchema(
  value: unknown,
): value is FieldSchema | MetricDimensionSchema {
  return typeof value === "object" && value != null && "id" in value;
}

function isMetricDimensionSchema(
  value: unknown,
): value is MetricDimensionSchema {
  return isFieldSchema(value);
}

function mapDatasetQueryData<TRow>(
  result: QueryQuestionResult | QueryDatasetResult | QueryMetricResult,
): QueryData<TRow> {
  return {
    ...result,
    rows: mapRowsToObjects<TRow>(result.columns, result.rows),
    rawRows: result.rows,
  };
}
