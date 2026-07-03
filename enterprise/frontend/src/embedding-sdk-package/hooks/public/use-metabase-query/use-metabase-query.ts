import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAsyncFn } from "react-use";

import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { useSdkLoadingState } from "embedding-sdk-shared/hooks/use-sdk-loading-state";
import {
  isTableInput,
  isUnaryOperator,
} from "embedding-sdk-shared/lib/create-metabase-query/input-guards";
import { getWindow } from "embedding-sdk-shared/lib/get-window";
import type { DatasetQuery } from "metabase-types/api";

import type { SchemaJavaScriptType, TableSchema } from "../data-schema";

import { mapDatasetQueryData } from "./map-dataset-query-data";
import { stableStringifyQuery } from "./stable-query-key";
import type {
  BetweenFilterOperatorForDimension,
  BinningOptions,
  BreakoutOptionsArgument,
  CountAggregationSchema,
  FieldAggregationOperator,
  FieldAggregationSchema,
  FilterLiteralValue,
  FilterOperator,
  MetabaseDimensionFilterForOperator,
  MetabaseQueryOptions,
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
  MetabaseQueryOptions,
  UseMetabaseQueryResult,
} from "./types";

export const count = (): CountAggregationSchema => ({
  type: "operator",
  operator: "count",
  args: [],
  columns: [{ name: "count", displayName: "Count", jsType: "number" }],
});

export const sum = <TDimension>(
  dimension: NumericAggregationDimension<TDimension>,
): FieldAggregationSchema<"sum", NumericAggregationDimension<TDimension>> =>
  fieldAggregation("sum", "Sum", dimension);

export const avg = <TDimension>(
  dimension: NumericAggregationDimension<TDimension>,
): FieldAggregationSchema<"avg", NumericAggregationDimension<TDimension>> =>
  fieldAggregation("avg", "Average", dimension);

export const median = <TDimension>(
  dimension: NumericAggregationDimension<TDimension>,
): FieldAggregationSchema<"median", NumericAggregationDimension<TDimension>> =>
  fieldAggregation("median", "Median", dimension);

export const distinct = <TDimension>(
  dimension: TDimension,
): FieldAggregationSchema<"distinct", TDimension> =>
  fieldAggregation("distinct", "Distinct values", dimension);

export const min = <TDimension>(
  dimension: OrderableAggregationDimension<TDimension>,
): FieldAggregationSchema<"min", OrderableAggregationDimension<TDimension>> =>
  fieldAggregation("min", "Minimum", dimension);

export const max = <TDimension>(
  dimension: OrderableAggregationDimension<TDimension>,
): FieldAggregationSchema<"max", OrderableAggregationDimension<TDimension>> =>
  fieldAggregation("max", "Maximum", dimension);

export const aggregations = {
  avg,
  count,
  distinct,
  max,
  median,
  min,
  sum,
} as const;

const fieldAggregation = <
  TOperator extends FieldAggregationOperator,
  TDimension,
>(
  type: TOperator,
  displayName: string,
  dimension: TDimension,
): FieldAggregationSchema<TOperator, TDimension> =>
  ({
    type: "operator",
    operator: type,
    args: [dimension],
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

const getResolveDatasetQueryFromBundle = () =>
  getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.resolveDatasetQuery;

export type UseMetabaseQueryObjectResult = {
  query: DatasetQuery | null;
  error: unknown;
  isLoading: boolean;
};

type QueryObjectState = {
  query: DatasetQuery;
  queryKey: string;
};

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
    const [min, max] = value as readonly unknown[];

    return {
      type: "operator",
      operator,
      args: [
        dimension,
        { type: "literal", value: min as FilterLiteralValue },
        { type: "literal", value: max as FilterLiteralValue },
      ],
    };
  }

  if (isUnaryOperator(operator)) {
    return { type: "operator", operator, args: [dimension] };
  }

  return {
    type: "operator",
    operator,
    args: [dimension, { type: "literal", value: value as FilterLiteralValue }],
  };
}

export function breakout<TDimension>(dimension: TDimension): TDimension;
export function breakout<TDimension>(
  dimension: TDimension,
  options: BreakoutOptionsArgument<TDimension>,
): TDimension & BreakoutOptionsArgument<TDimension>;
export function breakout<TDimension>(
  dimension: TDimension,
  options?: BreakoutOptionsArgument<TDimension>,
) {
  return {
    ...(dimension as object),
    unit: options && "unit" in options ? options.unit : undefined,
    ...getBinningOptions(options),
  };
}

function getBinningOptions(
  options:
    | {
        binning?: BinningOptions;
        bins?: number | "auto";
        binWidth?: number | "auto";
      }
    | undefined,
) {
  if (!options) {
    return undefined;
  }

  if ("bins" in options && options.bins != null) {
    return { bins: options.bins };
  }

  if ("binWidth" in options && options.binWidth != null) {
    return { binWidth: options.binWidth };
  }

  if (options.binning?.strategy === "num-bins") {
    return { bins: options.binning["num-bins"] };
  }

  if (options.binning?.strategy === "bin-width") {
    return { binWidth: options.binning["bin-width"] };
  }

  if (options.binning?.strategy === "default") {
    return { bins: "auto" as const };
  }

  return undefined;
}

const useMetabaseQueryImpl = <
  TEntity extends TableSchema | undefined = undefined,
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

  const queryDataset = getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.queryDataset;
  const resolveDatasetQuery = getResolveDatasetQueryFromBundle();

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
      if (isTableInput(currentQuery)) {
        if (!queryDataset || !resolveDatasetQuery) {
          return;
        }

        const datasetQuery =
          await resolveDatasetQuery(reduxStore)(currentQuery);
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
  }, [queryDataset, reduxStore, resolveDatasetQuery]);

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
  query: TableQuery<unknown>,
): UseMetabaseQueryObjectResult {
  const { loadingState } = useSdkLoadingState();

  const loginStatus = useLazySelector(
    getWindow()?.METABASE_EMBEDDING_SDK_BUNDLE?.getLoginStatus,
  );

  const {
    state: {
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();

  const queryKey = useMemo(() => stableStringifyQuery(query), [query]);
  const queryRef = useRef(query);
  const pendingQueryKeyRef = useRef<string | null>(null);

  queryRef.current = query;

  const [{ value, error, loading }, resolveQueryObject] =
    useAsyncFn(async (): Promise<QueryObjectState | null> => {
      const resolveDatasetQuery = getResolveDatasetQueryFromBundle();

      if (!reduxStore || !resolveDatasetQuery) {
        return null;
      }

      const result = await resolveDatasetQuery(reduxStore)(queryRef.current);

      return { query: result, queryKey };
    }, [queryKey, reduxStore]);

  useEffect(() => {
    if (
      !reduxStore ||
      !getResolveDatasetQueryFromBundle() ||
      loginStatus?.status !== "success"
    ) {
      return;
    }

    pendingQueryKeyRef.current = queryKey;
    resolveQueryObject();
  }, [
    loadingState,
    loginStatus?.status,
    queryKey,
    reduxStore,
    resolveQueryObject,
  ]);

  if (error && !loading && pendingQueryKeyRef.current === queryKey) {
    return { query: null, error, isLoading: false };
  }

  if (loginStatus?.status !== "success" || value?.queryKey !== queryKey) {
    return { query: null, error: null, isLoading: true };
  }

  return {
    query: value.query,
    error: error ?? null,
    isLoading: loading,
  };
}
