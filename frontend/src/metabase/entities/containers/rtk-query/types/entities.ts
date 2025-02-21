import type { BaseQueryFn, QueryDefinition } from "@reduxjs/toolkit/query";

import type { TagType } from "metabase/api/tags";
import type { IconName } from "metabase/ui";
import type { Collection } from "metabase-types/api";
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

export type EntityQuery = unknown;

export type EntityQuerySelector = (state: State, props: unknown) => EntityQuery;

export type ReloadInterval = number;

export type ReloadIntervalSelector<Entity> = (
  state: State,
  props: unknown,
  list: Entity[] | undefined,
) => ReloadInterval | undefined;

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

export type EntityObjectOptions = {
  entityId: EntityId | undefined;
  requestType: RequestType;
};

export type EntityListOptions = {
  entityQuery: EntityQuery;
};

export type EntityOptions = EntityObjectOptions | EntityListOptions;

export type EntityListQueryResponse<Data> =
  | Data
  | {
      data: Data;
      total: number;
    };

export interface EntityDefinition<Entity, EntityWrapper> {
  actions: {
    [actionName: string]: (...args: unknown[]) => unknown;
  };
  actionTypes: Record<string, string>;
  getListStatePath: (entityQuery: EntityQuery) => string;
  getObjectStatePath: (entityId: EntityId) => string;
  getQueryKey: (entityQuery: EntityQuery) => string;
  name: string;
  nameMany: string;
  nameOne: string;
  normalize: (object: unknown) => { object: unknown };
  normalizeList: (list: unknown) => { list: unknown };
  objectSelectors: {
    getName: (entity: Entity | EntityWrapper) => string;
    getIcon: (entity: Entity | EntityWrapper) => { name: IconName };
    getColor: (entity: Entity | EntityWrapper) => string | undefined;
    getCollection: (entity: Entity | EntityWrapper) => Collection | undefined;
  };
  rtk: {
    getUseGetQuery: (fetchType: FetchType) => {
      action?: string;
      transformResponse?: (data: Entity, query: EntityQuery) => unknown;
      useGetQuery: UseQuery<
        QueryDefinition<unknown, BaseQueryFn, TagType, Entity>
      >;
    };
    useListQuery: UseQuery<
      QueryDefinition<
        unknown,
        BaseQueryFn,
        TagType,
        EntityListQueryResponse<Entity[]>
      >
    >;
  };
  selectors: {
    getError: Selector<unknown | null | undefined>;
    getFetched: Selector<boolean | undefined>;
    getList: Selector<Entity[] | undefined>;
    getListMetadata: Selector<ListMetadata | undefined>;
    getListUnfiltered: Selector<Entity[] | undefined>;
    getLoaded: Selector<boolean | undefined>;
    getLoading: Selector<boolean | undefined>;
    getObject: Selector<Entity | undefined>;
    getObjectUnfiltered: Selector<Entity | undefined>;
  };
  wrapEntity: (object: Entity, dispatch: Dispatch) => EntityWrapper;
}

export interface ListMetadata {
  total?: number;
}
