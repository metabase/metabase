import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAsyncFn } from "react-use";

import { useLazySelector } from "embedding-sdk-package/hooks/private/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-package/lib/provider-props-store";
import { isQueryInput } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";

import type { QuestionSchema, TableSchema } from "../data-schema";

import {
  getEmbeddingSdkBundle,
  getResolveDatasetQueryFromBundle,
} from "./bundle";
import { mapDatasetQueryData } from "./map-dataset-query-data";
import { stableStringifyQuery } from "./stable-query-key";
import type {
  MetabaseDynamicQuery,
  MetabaseQueryOptions,
  UseMetabaseQuery,
  UseMetabaseQueryResult,
} from "./types";

const useMetabaseQueryImpl = <
  TEntity extends TableSchema | QuestionSchema | undefined = undefined,
  TSchema = unknown,
  TQuery extends MetabaseQueryOptions<TEntity, TSchema> = MetabaseQueryOptions<
    TEntity,
    TSchema
  >,
  TDynamic extends MetabaseDynamicQuery | undefined = undefined,
>(
  query: TQuery,
  dynamicQuery?: TDynamic,
): UseMetabaseQueryResult<TEntity, TQuery, TDynamic> => {
  const {
    state: {
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();

  const loginStatus = useLazySelector(getEmbeddingSdkBundle()?.getLoginStatus);

  const queryDataset = getEmbeddingSdkBundle()?.queryDataset;
  const resolveDatasetQuery = getResolveDatasetQueryFromBundle();

  const queryKey = useMemo(
    () => stableStringifyQuery([query, dynamicQuery]),
    [query, dynamicQuery],
  );
  const queryRef = useRef(query);
  const dynamicQueryRef = useRef(dynamicQuery);

  useEffect(() => {
    queryRef.current = query;
    dynamicQueryRef.current = dynamicQuery;
  }, [query, dynamicQuery, queryKey]);

  const [{ value: data = null, loading: isLoading, error }, fetchQuery] =
    useAsyncFn(async (): Promise<
      UseMetabaseQueryResult<TEntity, TQuery, TDynamic>["data"]
    > => {
      const currentQuery = queryRef.current;
      const currentDynamicQuery = dynamicQueryRef.current;

      // Either part can gate the query — a UI commonly holds the dynamic part
      // back until the user has picked a value.
      if (
        currentQuery.enabled === false ||
        currentDynamicQuery?.enabled === false
      ) {
        return null;
      }

      if (!reduxStore) {
        return null;
      }

      if (isQueryInput(currentQuery)) {
        if (!queryDataset || !resolveDatasetQuery) {
          return null;
        }

        const datasetQuery = await resolveDatasetQuery(reduxStore)(
          currentQuery,
          currentDynamicQuery,
        );
        const result = await queryDataset(reduxStore)({ datasetQuery });

        return mapDatasetQueryData(result);
      }

      return null;
    }, [queryDataset, reduxStore, resolveDatasetQuery]);

  // Type signature of refetch requires returning Promise<void>
  const refetch = useCallback(async () => {
    await fetchQuery();
  }, [fetchQuery]);

  useEffect(() => {
    if (loginStatus?.status === "success") {
      refetch();
    }
  }, [loginStatus?.status, queryKey, refetch]);

  return {
    data,
    isLoading,
    error: isLoading ? null : (error ?? null),
    refetch,
  };
};

/** @notExported useMetabaseQuery */
export const useMetabaseQuery = useMetabaseQueryImpl as UseMetabaseQuery;
