import { useEffect, useMemo, useRef } from "react";
import { useAsyncFn } from "react-use";

import { useLazySelector } from "embedding-sdk-package/hooks/private/use-lazy-selector";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { useSdkLoadingState } from "embedding-sdk-shared/hooks/use-sdk-loading-state";
import type { MetabaseQueryObject } from "metabase/embedding-sdk/types/question";

import {
  getEmbeddingSdkBundle,
  getResolveDatasetQueryFromBundle,
} from "./bundle";
import { stableStringifyQuery } from "./stable-query-key";
import type { MetabaseQueryOptions } from "./types";

export type UseMetabaseQueryObjectResult = {
  query: MetabaseQueryObject | null;
  error: unknown;
  isLoading: boolean;
};

type QueryObjectState = {
  query: MetabaseQueryObject;
  queryKey: string;
};

/**
 * Resolves a data app query into a query object that can be passed to SDK question components.
 */
export function useMetabaseQueryObject(
  query: MetabaseQueryOptions,
): UseMetabaseQueryObjectResult {
  const { loadingState } = useSdkLoadingState();

  const loginStatus = useLazySelector(getEmbeddingSdkBundle()?.getLoginStatus);

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

      return {
        // The bundle returns the opaque `DatasetQuery`; the public API publishes
        // the structural `MetabaseQueryObject` instead (see its own docs for why).
        query: result as MetabaseQueryObject,
        queryKey,
      };
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
