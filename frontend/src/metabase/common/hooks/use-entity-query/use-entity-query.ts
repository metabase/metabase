import { useDeepCompareEffect } from "react-use";
import type { Action } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { State } from "metabase-types/store";

export interface EntityQuery<TId> {
  id: TId;
}

export interface EntityFetchOptions {
  reload?: boolean;
  requestType?: string;
}

export interface EntityQueryOptions<TId> {
  entityId?: TId;
}

export interface UseEntityOwnProps<TId, TItem> {
  fetch: (query: EntityQuery<TId>, options?: EntityFetchOptions) => Action;
  getObject: (
    state: State,
    options: EntityQueryOptions<TId>,
  ) => TItem | undefined;
  getLoading: (state: State, options: EntityQueryOptions<TId>) => boolean;
  getError: (state: State, options: EntityQueryOptions<TId>) => unknown;
  requestType?: string;
}

export interface UseEntityQueryProps<TId, TQuery = never> {
  id?: TId;
  query?: TQuery;
  reload?: boolean;
  enabled?: boolean;
}

export interface UseEntityQueryResult<TItem> {
  data?: TItem;
  isLoading: boolean;
  error: unknown;
}

export const useEntityQuery = <TId, TItem, TQuery = never>(
  {
    id: entityId,
    query: entityQuery,
    reload = false,
    enabled = true,
  }: UseEntityQueryProps<TId, TQuery>,
  {
    fetch,
    getObject,
    getLoading,
    getError,
    requestType,
  }: UseEntityOwnProps<TId, TItem>,
): UseEntityQueryResult<TItem> => {
  const options = { entityId, requestType };
  const data = useSelector(state => getObject(state, options));
  const isLoading = useSelector(state => getLoading(state, options));
  const error = useSelector(state => getError(state, options));

  const dispatch = useDispatch();
  useDeepCompareEffect(() => {
    if (entityId != null && enabled) {
      const query = { ...entityQuery, id: entityId };
      const action = dispatch(fetch(query, { reload, requestType }));
      Promise.resolve(action).catch(() => undefined);
    }
  }, [dispatch, fetch, entityId, entityQuery, enabled, reload, requestType]);

  return { data, isLoading, error };
};
