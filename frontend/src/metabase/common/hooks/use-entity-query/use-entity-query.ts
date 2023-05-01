import { useEffect } from "react";
import type { Action } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { State } from "metabase-types/store";

export interface EntityFetchOptions {
  reload?: boolean;
  requestType?: string;
}

export interface EntityQueryOptions<TQuery> {
  entityQuery?: TQuery;
}

export interface UseEntityOwnProps<TItem, TQuery> {
  fetch: (query?: TQuery, options?: EntityFetchOptions) => Action;
  getObject: (
    state: State,
    options: EntityQueryOptions<TQuery>,
  ) => TItem | undefined;
  getLoading: (state: State, options: EntityQueryOptions<TQuery>) => boolean;
  getError: (state: State, options: EntityQueryOptions<TQuery>) => unknown;
  requestType?: string;
}

export interface UseEntityQueryProps<TQuery> {
  query?: TQuery;
  reload?: boolean;
  enabled?: boolean;
}

export interface UseEntityQueryResult<TItem> {
  data?: TItem;
  isLoading: boolean;
  error: unknown;
}

export const useEntityQuery = <TItem, TQuery>(
  {
    query: entityQuery,
    reload = false,
    enabled = true,
  }: UseEntityQueryProps<TQuery>,
  {
    fetch,
    getObject,
    getLoading,
    getError,
    requestType,
  }: UseEntityOwnProps<TItem, TQuery>,
): UseEntityQueryResult<TItem> => {
  const options = { entityQuery, requestType };
  const data = useSelector(state => getObject(state, options));
  const isLoading = useSelector(state => getLoading(state, options));
  const error = useSelector(state => getError(state, options));

  const dispatch = useDispatch();
  useEffect(() => {
    if (enabled) {
      dispatch(fetch(entityQuery, { reload, requestType }));
    }
  }, [dispatch, fetch, entityQuery, enabled, reload, requestType]);

  return { data, isLoading, error };
};
