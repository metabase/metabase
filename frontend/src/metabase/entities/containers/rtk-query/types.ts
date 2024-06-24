import type { UseQuery } from "@reduxjs/toolkit/dist/query/react/buildHooks";
import type {
  BaseQueryFn,
  QueryDefinition,
  SubscriptionOptions,
} from "@reduxjs/toolkit/query";

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

// This type is defined in RTK Query but is not exported
export type UseQuerySubscriptionOptions = SubscriptionOptions & {
  skip?: boolean;
  refetchOnMountOrArgChange?: boolean | number;
};

export interface EntityDefinition<Entity, EntityWrapper> {
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
    getUseGetQuery: (fetchType: FetchType) => {
      useGetQuery: UseQuery<
        QueryDefinition<unknown, BaseQueryFn, TagType, unknown>
      >;
      options?: UseQuerySubscriptionOptions;
    };
    getUseGetListQuery: (requestType: RequestType) => {
      useGetQuery: UseQuery<
        QueryDefinition<unknown, BaseQueryFn, TagType, unknown[]>
      >;
      options?: UseQuerySubscriptionOptions;
    };
  };
  selectors: {
    getFetched: Selector<boolean | undefined>;
    getLoading: Selector<boolean | undefined>;
    getError: Selector<unknown | null | undefined>;
  } & {
    [selectorName: string]: Selector<Entity | undefined>;
  };
  wrapEntity: (object: Entity, dispatch: Dispatch) => EntityWrapper;
}
