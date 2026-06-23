import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { QueryQuestionResult } from "embedding-sdk-bundle/lib/query-question";
import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { useSdkLoadingState } from "embedding-sdk-shared/hooks/use-sdk-loading-state";
import {
  isMetricInput,
  isQuestionInput,
  isTableInput,
  isUnaryOperator,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type { DatasetQuery } from "metabase-types/api";

import type {
  QuestionSchema,
  SchemaJavaScriptType,
  TableSchema,
} from "../data-schema";
import { mapRowsToObjects } from "../data-schema";

import { mapDatasetQueryData } from "./map-dataset-query-data";
import { stableStringifyQuery } from "./stable-query-key";
import type {
  BetweenFilterOperatorForDimension,
  BreakoutOptionsArgument,
  CountAggregationSchema,
  FieldAggregationOperator,
  FieldAggregationSchema,
  FilterOperator,
  MetabaseDimensionFilterForOperator,
  MetabaseQueryOptions,
  MetricQuery,
  MetricReference,
  NumericAggregationDimension,
  OrderableAggregationDimension,
  TableQuery,
  UnaryFilterOperatorForDimension,
  UseMetabaseQuery,
  UseMetabaseQueryResult,
  ValueFilterOperatorForDimension,
} from "./types";
export type {
  CountAggregation,
  CountAggregationSchema,
  FieldAggregation,
  FieldAggregationOperator,
  FieldAggregationSchema,
  MetabaseBreakout,
  MetabaseDimensionFilter,
  MetabaseMetricBreakout,
  MetabaseMetricDimensionFilter,
  MetabaseQueryOptions,
  UseMetabaseQueryResult,
} from "./types";

/** @internal */
export const count = (): CountAggregationSchema => ({
  type: "count",
  columns: [{ name: "count", displayName: "Count", jsType: "number" }],
});

/** @internal */
export const sum = <TDimension>(
  dimension: NumericAggregationDimension<TDimension>,
): FieldAggregationSchema<"sum", NumericAggregationDimension<TDimension>> =>
  fieldAggregation("sum", "Sum", dimension);

/** @internal */
export const avg = <TDimension>(
  dimension: NumericAggregationDimension<TDimension>,
): FieldAggregationSchema<"avg", NumericAggregationDimension<TDimension>> =>
  fieldAggregation("avg", "Average", dimension);

/** @internal */
export const median = <TDimension>(
  dimension: NumericAggregationDimension<TDimension>,
): FieldAggregationSchema<"median", NumericAggregationDimension<TDimension>> =>
  fieldAggregation("median", "Median", dimension);

/** @internal */
export const distinct = <TDimension>(
  dimension: TDimension,
): FieldAggregationSchema<"distinct", TDimension> =>
  fieldAggregation("distinct", "Distinct values", dimension);

/** @internal */
export const min = <TDimension>(
  dimension: OrderableAggregationDimension<TDimension>,
): FieldAggregationSchema<"min", OrderableAggregationDimension<TDimension>> =>
  fieldAggregation("min", "Minimum", dimension);

/** @internal */
export const max = <TDimension>(
  dimension: OrderableAggregationDimension<TDimension>,
): FieldAggregationSchema<"max", OrderableAggregationDimension<TDimension>> =>
  fieldAggregation("max", "Maximum", dimension);

const fieldAggregation = <
  TOperator extends FieldAggregationOperator,
  TDimension,
>(
  type: TOperator,
  displayName: string,
  dimension: TDimension,
): FieldAggregationSchema<TOperator, TDimension> =>
  ({
    type,
    dimension,
    columns: [
      {
        name: getFieldAggregationColumnName(type),
        displayName,
        jsType: getFieldAggregationColumnJavaScriptType(type, dimension),
      },
    ],
  }) as unknown as FieldAggregationSchema<TOperator, TDimension>;

const getFieldAggregationColumnName = (
  type: FieldAggregationOperator,
): string => (type === "distinct" ? "count" : type);

function getFieldAggregationColumnJavaScriptType(
  type: FieldAggregationOperator,
  dimension: unknown,
): SchemaJavaScriptType {
  if (type !== "min" && type !== "max") {
    return "number";
  }

  if (dimension == null || typeof dimension !== "object") {
    return "number";
  }

  const jsType = (dimension as { jsType?: unknown }).jsType;

  if (isOrderableJavaScriptType(jsType)) {
    return jsType;
  }

  return "number";
}

const isOrderableJavaScriptType = (
  value: unknown,
): value is Exclude<SchemaJavaScriptType, "unknown"> =>
  value === "string" ||
  value === "number" ||
  value === "boolean" ||
  value === "Date";

function mapQueryData<TRow>(result: QueryQuestionResult) {
  const rawRows = result.rows;

  return {
    ...result,
    rows: mapRowsToObjects<TRow>(result.columns, rawRows),
    rawRows,
  };
}

const getCreateMetabaseQueryFromBundle = () =>
  getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.createMetabaseQuery;

/** @notExported filter */
export function filter<
  TDimension,
  TOperator extends ValueFilterOperatorForDimension<TDimension>,
>(
  dimension: TDimension,
  operator: TOperator,
  value: unknown,
): MetabaseDimensionFilterForOperator<TDimension, TOperator>;
export function filter<
  TDimension,
  TOperator extends BetweenFilterOperatorForDimension<TDimension>,
>(
  dimension: TDimension,
  operator: TOperator,
  values: readonly [unknown, unknown],
): MetabaseDimensionFilterForOperator<TDimension, TOperator>;
export function filter<
  TDimension,
  TOperator extends UnaryFilterOperatorForDimension<TDimension>,
>(
  dimension: TDimension,
  operator: TOperator,
): MetabaseDimensionFilterForOperator<TDimension, TOperator>;
export function filter(
  dimension: unknown,
  operator: FilterOperator,
  value?: unknown,
): MetabaseDimensionFilterForOperator<unknown, FilterOperator> {
  if (operator === "between") {
    return { dimension, operator, values: value as readonly unknown[] };
  }

  if (isUnaryOperator(operator)) {
    return { dimension, operator };
  }

  return { dimension, operator, value };
}

/** @notExported breakout */
export function breakout<TDimension>(dimension: TDimension): {
  dimension: TDimension;
};
export function breakout<TDimension>(
  dimension: TDimension,
  options: BreakoutOptionsArgument<TDimension>,
): {
  dimension: TDimension;
} & BreakoutOptionsArgument<TDimension>;
export function breakout<TDimension>(
  dimension: TDimension,
  options?: BreakoutOptionsArgument<TDimension>,
) {
  return { dimension, ...options };
}

const useMetabaseQueryImpl = <
  TEntity extends QuestionSchema | TableSchema | MetricReference | undefined =
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

  const [data, setData] =
    useState<UseMetabaseQueryResult<TEntity, TQuery>["data"]>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const queryKey = useMemo(() => stableStringifyQuery(query), [query]);
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
      if (isQuestionInput(currentQuery)) {
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

      if (isTableInput(currentQuery) || isMetricInput(currentQuery)) {
        if (!queryDataset) {
          return;
        }

        const datasetQuery = createMetabaseQuery(currentQuery);
        const result = await queryDataset(reduxStore)({ datasetQuery });

        setData(mapDatasetQueryData(result));
        return;
      }
    } catch (err) {
      setError(err);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [queryDataset, queryQuestion, reduxStore]);

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

/** @notExported useMetabaseQuery */
export const useMetabaseQuery = useMetabaseQueryImpl as UseMetabaseQuery;

/** @notExported useMetabaseQueryObject */
export function useMetabaseQueryObject(
  query: TableQuery<unknown> | MetricQuery<unknown>,
): DatasetQuery | null {
  const { loadingState } = useSdkLoadingState();

  const queryKey = useMemo(() => stableStringifyQuery(query), [query]);
  const queryRef = useRef(query);

  queryRef.current = query;

  return useMemo(
    () => {
      const createQuery = getCreateMetabaseQueryFromBundle();

      if (!createQuery) {
        return null;
      }

      return createQuery(queryRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey tracks query contents while avoiding object identity churn.
    [loadingState, queryKey],
  );
}

/** @notExported createMetabaseQuery */
export function createMetabaseQuery(
  query: TableQuery<unknown> | MetricQuery<unknown>,
): DatasetQuery {
  const createQuery = getCreateMetabaseQueryFromBundle();

  if (!createQuery) {
    throw new Error(
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- Internal SDK developer error.
      "createMetabaseQuery requires the Metabase Embedding SDK bundle to be loaded.",
    );
  }

  return createQuery(query);
}
