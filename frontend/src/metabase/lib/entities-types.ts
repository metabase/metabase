import type { Action } from "@reduxjs/toolkit";
import type { schema } from "normalizr";

import type { IconName } from "metabase/ui";
import type {
  Dispatch,
  GetState,
  ReduxAction,
  State,
} from "metabase-types/store";

export type $TS_FIXME = any;

export interface EntityQuery {}

export type EntityId = string | number;
export type EntityObjectId = { id: EntityId };

export type EntityState = {
  entities: $TS_FIXME;
  settings: $TS_FIXME;
};

interface AnyAction extends Action {
  payload: $TS_FIXME;
}

export type EntityReducer = (state: State, action: AnyAction) => State;

export interface Entity<EntityObject = $TS_FIXME> {
  name: string;
  nameOne: string;
  nameMany: string;
  displayNameOne: string;
  displayNameMany: string;
  schema: schema.Entity<EntityObject>;
  api: {
    list: $TS_FIXME;
    create: $TS_FIXME;
    get: $TS_FIXME;
    update: $TS_FIXME;
    delete: $TS_FIXME;
  } & Record<string, $TS_FIXME>;
  actionDecorators?: {
    [key: string]: (
      thunkCreator: $TS_FIXME,
    ) => (
      entity: EntityObject,
    ) => (dispatch: $TS_FIXME, getState: $TS_FIXME) => Promise<$TS_FIXME>;
  };
  actionTypes: Record<string, string>;
  actionShouldInvalidateLists: (action: { type: string }) => boolean;
  getQueryKey: (entityQuery: EntityQuery) => string;
  getObjectStatePath: (entitId: EntityId) => ["entities", string, EntityId];
  getListStatePath: (entityQuery: EntityQuery) => ["entities", string, string];
  objectActions: Record<string, (...args: $TS_FIXME[]) => $TS_FIXME>;
  wrapEntity: (object: $TS_FIXME, dispatch?: Dispatch | null) => $TS_FIXME;
  objectSelectors: {
    getName: (object: $TS_FIXME) => string | undefined;
    getIcon: (object: $TS_FIXME, opts?: $TS_FIXME) => { name: IconName };
    getColor: (object: $TS_FIXME) => string | undefined;
    getCollection: (object: $TS_FIXME) => $TS_FIXME;
    [getMethod: string]: (object: $TS_FIXME, opts?: $TS_FIXME) => $TS_FIXME;
  };
  normalize: $TS_FIXME;
  normalizeList: $TS_FIXME;
  actions: $TS_FIXME;
  reducers: Record<string, $TS_FIXME>;
  requestsReducer: EntityReducer;
  selectors: $TS_FIXME;
  HACK_getObjectFromAction: (action: {
    payload: $TS_FIXME | $TS_FIXME[];
  }) => EntityObject;
  load: $TS_FIXME;
  loadList: $TS_FIXME;
  Name: $TS_FIXME;
  rtk: $TS_FIXME;
  getAnalyticsMetadata?: (
    object: $TS_FIXME,
    action: { action: ReduxAction },
    getState: GetState,
  ) => string | null;
}

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type OptionalEntityDefinitionKeys =
  | "actionShouldInvalidateLists"
  | "actionTypes"
  | "actions"
  | "displayNameMany"
  | "displayNameOne"
  | "getAnalyticsMetadata"
  | "nameMany"
  | "nameOne"
  | "objectActions"
  | "reducers"
  | "selectors"
  | "wrapEntity";

export type OmitEntityDefinitionKeys =
  | "HACK_getObjectFromAction"
  | "Name"
  | "getListStatePath"
  | "getObjectStatePath"
  | "getQueryKey"
  | "load"
  | "loadList"
  | "normalize"
  | "normalizeList"
  | "objectSelectors"
  | "requestsReducer";

export type EntityDefinition<EntityObject = $TS_FIXME> = Omit<
  Optional<Entity<EntityObject>, OptionalEntityDefinitionKeys>,
  OmitEntityDefinitionKeys
> & {
  createSelectors?: (defaultSelectors: {
    getObject: $TS_FIXME;
    getFetched: $TS_FIXME;
  }) => $TS_FIXME;
  objectSelectors?: Partial<Entity<EntityObject>["objectSelectors"]>;
  reducer?: EntityReducer;
  writableProperties?: string[];
};
