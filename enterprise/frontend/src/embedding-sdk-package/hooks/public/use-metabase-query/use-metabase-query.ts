import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useLazySelector } from "embedding-sdk-shared/hooks/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { isQueryInput } from "embedding-sdk-shared/lib/create-metabase-query/input-guards";

import type { QuestionSchema, TableSchema } from "../data-schema";

import {
  getEmbeddingSdkBundle,
  getResolveDatasetQueryFromBundle,
} from "./bundle";
import { mapDatasetQueryData } from "./map-dataset-query-data";
import { stableStringifyQuery } from "./stable-query-key";
import type {
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
>(
  query: TQuery,
): UseMetabaseQueryResult<TEntity, TQuery> => {
  const {
    state: {
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();

  const loginStatus = useLazySelector(getEmbeddingSdkBundle()?.getLoginStatus);

  const queryDataset = getEmbeddingSdkBundle()?.queryDataset;
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
      if (isQueryInput(currentQuery)) {
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
