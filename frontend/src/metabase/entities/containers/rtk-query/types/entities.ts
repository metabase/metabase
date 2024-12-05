import type { BaseQueryFn, QueryDefinition } from "@reduxjs/toolkit/query";

import type { TagType } from "metabase/api/tags";
import type { Dispatch, State } from "metabase-types/store";

import type { UseQuery } from "./rtk";

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

/**
 * Corresponds to the "name" parameter passed to "createEntity" function.
 * There should be an entry here for every "createEntity" function call.
 */
export type EntityType =
  | "actions"
  | "alerts"
  | "bookmarks"
  | "collections"
  | "dashboards"
  | "databases"
  | "fields"
  | "groups"
  | "indexedEntities"
  | "persistedModels"
  | "pulses"
  | "questions"
  | "revisions"
  | "schemas"
  | "search"
  | "segments"
  | "snippetCollections"
  | "snippets"
  | "tables"
  | "timelineEvents"
  | "timelines"
  | "users";

export type EntityTypeSelector = (state: State, props: unknown) => EntityType;

export interface EntityOptions {
  entityId: EntityId | undefined;
  requestType: RequestType;
}

export interface EntityDefinition<Entity, EntityWrapper> {
  actions: {
    [actionName: string]: (...args: unknown[]) => unknown;
  };
  actionTypes: Record<string, string>;
  getQueryKey: (entityQuery: EntityQuery) => string;
  getObjectStatePath: (entityId: EntityId) => string;
  name: string;
  nameOne: string;
  normalize: (object: unknown) => {
    object: unknown;
  };
  rtk: {
    getUseGetQuery: (fetchType: FetchType) => {
      action?: string;
      transformResponse?: (data: Entity, query: EntityQuery) => unknown;
      useGetQuery: UseQuery<
        QueryDefinition<unknown, BaseQueryFn, TagType, Entity>
      >;
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
