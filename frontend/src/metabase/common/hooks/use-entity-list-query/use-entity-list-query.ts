import { useDeepCompareEffect, usePrevious } from "react-use";
import type { Action } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { State } from "metabase-types/store";

export interface EntityFetchOptions {
  reload?: boolean;
}

export interface EntityQueryOptions<TQuery = never> {
  entityQuery?: TQuery;
}

export interface UseEntityListOwnProps<TItem, TQuery = never> {
  fetchList: (query?: TQuery, options?: EntityFetchOptions) => Action;
  getList: (
    state: State,
    options: EntityQueryOptions<TQuery>,
  ) => TItem[] | undefined;
  getLoading: (state: State, options: EntityQueryOptions<TQuery>) => boolean;
  getLoaded: (state: State, options: EntityQueryOptions<TQuery>) => boolean;
  getError: (state: State, options: EntityQueryOptions<TQuery>) => unknown;
}

export interface UseEntityListQueryProps<TQuery = never> {
  query?: TQuery;
  reload?: boolean;
  enabled?: boolean;
}

export interface UseEntityListQueryResult<TItem> {
  data?: TItem[];
  isLoading: boolean;
  error: unknown;
}

export const useEntityListQuery = <TItem, TQuery = never>(
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
  }: UseEntityListOwnProps<TItem, TQuery>,
): UseEntityListQueryResult<TItem> => {
  const options = { entityQuery };
  const data = useSelector(state => getList(state, options));
  const error = useSelector(state => getError(state, options));
  const isLoading = useSelector(state => getLoading(state, options));
  const isLoaded = useSelector(state => getLoaded(state, options));
  const isLoadedPreviously = usePrevious(isLoaded);
  const isInvalidated = !isLoaded && isLoadedPreviously;

  const dispatch = useDispatch();
  useDeepCompareEffect(() => {
    if (enabled || (enabled && isInvalidated)) {
      const action = dispatch(fetchList(entityQuery, { reload }));
      Promise.resolve(action).catch(() => undefined);
    }
  }, [dispatch, fetchList, entityQuery, reload, enabled, isInvalidated]);

  return { data, isLoading, error };
};
