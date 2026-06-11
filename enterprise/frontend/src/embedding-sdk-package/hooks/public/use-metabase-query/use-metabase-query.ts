import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type { StructuredDatasetQuery } from "metabase-types/api";

import type { QuestionSchema, TableSchema } from "../data-schema";
import { mapQueryData } from "../data-schema";

import {
  getTableDatabaseId,
  isMetricQuery,
  isQuestionQuery,
  isTableQuery,
  isUnaryOperator,
} from "./guards";
import { mapDatasetQueryData } from "./map-dataset-query-data";
import { buildMetricDefinition } from "./metric-query-builder";
import { stableStringifyQuery } from "./stable-query-key";
import { buildTableDatasetQuery } from "./table-query-builder";
import type {
  BetweenFilterOperatorForDimension,
  BreakoutOptionsArgument,
  FilterOperator,
  MetabaseDimensionFilterForOperator,
  MetabaseQueryOptions,
  MetricReference,
  TableQuery,
  UnaryFilterOperatorForDimension,
  UseMetabaseQuery,
  UseMetabaseQueryResult,
  ValueFilterOperatorForDimension,
} from "./types";
export type {
  MetabaseBreakout,
  MetabaseDimensionFilter,
  MetabaseMetricBreakout,
  MetabaseMetricDimensionFilter,
  MetabaseQueryOptions,
  UseMetabaseQueryResult,
} from "./types";

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
  const queryMetric = getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.queryMetric;

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
          datasetQuery:
            getTableDatabaseId(currentQuery) == null
              ? buildTableDatasetQuery(currentQuery)
              : createMetabaseQuery(currentQuery),
        });

        setData(mapDatasetQueryData(result));
        return;
      }

      if (isMetricQuery(currentQuery)) {
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

export const useMetabaseQuery = useMetabaseQueryImpl as UseMetabaseQuery;

export function useMetabaseQueryObject(
  query: TableQuery<unknown>,
): StructuredDatasetQuery {
  const queryKey = useMemo(() => stableStringifyQuery(query), [query]);
  const queryRef = useRef(query);

  queryRef.current = query;

  // eslint-disable-next-line react-hooks/exhaustive-deps -- queryKey tracks query contents while avoiding object identity churn.
  return useMemo(() => createMetabaseQuery(queryRef.current), [queryKey]);
}

export function createMetabaseQuery(
  query: TableQuery<unknown>,
): StructuredDatasetQuery {
  const databaseId = getTableDatabaseId(query);

  if (databaseId == null) {
    throw new Error(
      "Query creation requires a generated table schema or databaseId.",
    );
  }

  return {
    ...buildTableDatasetQuery(query),
    database: Number(databaseId),
  };
}
