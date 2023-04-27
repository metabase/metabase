import type { Action } from "@reduxjs/toolkit";
import { State } from "metabase-types/store";

export interface EntityDefinition<TItem, TQuery> {
  actions: EntityActions<TQuery>;
  selectors: EntitySelectors<TItem, TQuery>;
}

export interface EntityActions<TQuery> {
  fetchList: (query?: TQuery, options?: EntityFetchOptions) => Action;
}

export interface EntitySelectors<TItem, TQuery> {
  getList: (
    state: State,
    options: EntityQueryOptions<TQuery>,
  ) => TItem[] | undefined;
  getLoading: (state: State, options: EntityQueryOptions<TQuery>) => boolean;
  getError: (state: State, options: EntityQueryOptions<TQuery>) => unknown;
}

export interface EntityFetchOptions {
  reload?: boolean;
}

export interface EntityQueryOptions<TQuery> {
  entityQuery?: TQuery;
}
