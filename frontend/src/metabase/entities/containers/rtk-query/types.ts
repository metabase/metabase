import type { UseQuery } from "@reduxjs/toolkit/dist/query/react/buildHooks";
import type { BaseQueryFn, QueryDefinition } from "@reduxjs/toolkit/query";

import type { TagType } from "metabase/api/tags";
import type { Dispatch, State } from "metabase-types/store";

export type Selector<T> = (state: State, entityOptions: EntityOptions) => T;

export type RequestType = "fetch" | string;

export type FetchType = string;

export type EntityId = string | number;

export type EntityIdSelector = (
  state: State,
  props: unknown,
) => EntityId | undefined;

export type EntityQuery = any;

export type EntityQuerySelector = (state: State, props: unknown) => EntityQuery;

export type EntityType = "database" | "table" | string; // TODO

export type EntityTypeSelector = (state: State, props: unknown) => EntityType;

export interface EntityOptions {
  entityId: EntityId | undefined;
  requestType: RequestType;
}

export interface EntityDefinition {
  actions: {
    [actionName: string]: (...args: unknown[]) => unknown;
  };
  actionTypes: Record<string, string>;
  getQueryKey: (entityQuery: EntityQuery) => string;
  getObjectStatePath: (entityId: EntityId) => string;
  nameOne: string;
  normalize: (object: unknown) => {
    object: unknown;
  };
  rtk: {
    useGetQuery: UseQuery<
      QueryDefinition<unknown, BaseQueryFn, TagType, unknown>
    >;
    useGetListQuery: UseQuery<
      QueryDefinition<unknown, BaseQueryFn, TagType, unknown[]>
    >;
  };
  selectors: {
    getFetched: Selector<boolean>;
    getLoading: Selector<boolean>;
    getError: Selector<unknown | null>;
    [selectorName: string]: Selector<unknown>;
  };
  wrapEntity: (object: unknown, dispatch: Dispatch) => unknown;
}
