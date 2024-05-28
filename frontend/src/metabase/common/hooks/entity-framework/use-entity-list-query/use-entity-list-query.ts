import type { Action } from "@reduxjs/toolkit";
import { useDeepCompareEffect, usePrevious } from "react-use";

import { useDispatch, useSelector } from "metabase/lib/redux";
import type { State } from "metabase-types/store";

export interface EntityFetchOptions {
  reload?: boolean;
}

export interface EntityQueryOptions<TQuery = never> {
  entityQuery?: TQuery;
}

export interface UseEntityListOwnProps<
  TItem,
  TQuery = never,
  TMetadata = never,
> {
  fetchList: (query?: TQuery, options?: EntityFetchOptions) => Action;
  getList: (
    state: State,
    options: EntityQueryOptions<TQuery>,
  ) => TItem[] | undefined;
  getLoading: (
    state: State,
    options: EntityQueryOptions<TQuery>,
  ) => boolean | undefined;
  getLoaded: (
    state: State,
    options: EntityQueryOptions<TQuery>,
  ) => boolean | undefined;
  getError: (state: State, options: EntityQueryOptions<TQuery>) => unknown;
  getListMetadata: (
    state: State,
    options: EntityQueryOptions<TQuery>,
  ) => TMetadata | undefined;
}

export interface UseEntityListQueryProps<TQuery = never> {
  query?: TQuery;
  reload?: boolean;
  enabled?: boolean;
}

export interface UseEntityListQueryResult<TItem, TMetadata = never> {
  data?: TItem[];
  metadata?: TMetadata;
  isLoading: boolean;
  error: unknown;
}

/**
 * @deprecated use "metabase/api" instead
 */
export const useEntityListQuery = <TItem, TQuery = never, TMetadata = never>(
  {
    query: entityQuery,
    reload = false,
    enabled = true,
  }: UseEntityListQueryProps<TQuery>,
  {
    fetchList,
    getList,
    getLoading,
    getLoaded,
    getError,
    getListMetadata,
  }: UseEntityListOwnProps<TItem, TQuery, TMetadata>,
): UseEntityListQueryResult<TItem, TMetadata> => {
  const options = { entityQuery };
  const data = useSelector(state => getList(state, options));
  const metadata = useSelector(state => getListMetadata(state, options));
  const error = useSelector(state => getError(state, options));
  const isLoading = useSelector(state => getLoading(state, options));
  const isLoadingOrDefault = isLoading ?? enabled;
  const isLoaded = useSelector(state => getLoaded(state, options));
  const isLoadedPreviously = usePrevious(isLoaded);
  const isInvalidated = !isLoaded && isLoadedPreviously;
  const dispatch = useDispatch();

  useDeepCompareEffect(() => {
    if (enabled) {
      const action = dispatch(fetchList(entityQuery, { reload }));
      Promise.resolve(action).catch(() => undefined);
    }
  }, [dispatch, fetchList, entityQuery, reload, enabled]);

  useDeepCompareEffect(() => {
    if (enabled && isInvalidated) {
      const action = dispatch(fetchList(entityQuery));
      Promise.resolve(action).catch(() => undefined);
    }
  }, [dispatch, fetchList, entityQuery, reload, enabled, isInvalidated]);

  return { data, metadata, isLoading: isLoadingOrDefault, error };
};
