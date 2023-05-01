import { useEffect } from "react";
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

export interface UseEntityQueryProps<TId, TQuery> {
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

export const useEntityQuery = <TId, TItem, TQuery>(
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
  const data = useSelector(state => getObject(state, { entityId }));
  const isLoading = useSelector(state => getLoading(state, { entityId }));
  const error = useSelector(state => getError(state, { entityId }));

  const dispatch = useDispatch();
  useEffect(() => {
    if (entityId != null && enabled) {
      const query = { ...entityQuery, id: entityId };
      dispatch(fetch(query, { reload, requestType }));
    }
  }, [dispatch, fetch, entityId, entityQuery, enabled, reload, requestType]);

  return { data, isLoading, error };
};
