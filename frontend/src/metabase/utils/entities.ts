/*
 * # Entities abstract the interface between the back-end and the front-end.
 *
 * ## Endpoint requirements for entities:
 *
 * When fetching a list, each item of the list must include an `id` key/value pair.
 *
 * JSON must wrap response inside a `{ "data" : { …your data } }` structure.
 *
 * ## Required Properties:
 *
 * name:
 *   a string in plural form
 *   examples:
 *     "questions", "dashboards"
 *
 * path:
 *   a uri
 *     starting with "/api/"
 *     conventionally followed by the entity name in singular form
 *   examples:
 *     "/api/card", "/api/dashboard"
 *
 * ## Optional properties:
 *
 * api:
 *
 * here you can override the basic entity methods like `list`, `create`, `get`, `update`, `delete` (OR see `path` below)
 *
 * schema:
 *   normalizr schema
 *   default:
 *     `new schema.Entity(entity.name)`
 *
 * ## How to create a bare-bones entity
 *
 * Say we want to create a "books" entity, to be able to fetch a list of "books".
 *
 * Add the following line to `frontend/src/metabase/entities.index.js`:
 *
 *   export { default as books } from "./books"
 *
 * Create file `frontend/src/metabase/entities/books.js`
 *
 * Add the following to it:
 *
 *   import { createEntity } from "metabase/lib/entities";

 *   const Books = createEntity({
 *     name: "books",
 *     nameOne: "book",
 *     path: "/api/book",
 *   });
 *
 *   export default Books;
 *
 * ## How to consume an entity:
 *
 * Near the top of a container file, import the entity:
 *
 *   import Book from "metabase/entities/books";
 *
 * Near the bottom of the container file, add the entity to a `compose` statement:
 *
 *   export default _.compose(
 *     Book.loadList(),
 *     connect(mapStateToProps),
 *   )(BookContainer);
 */

import type { Reducer } from "@reduxjs/toolkit";
import { createSelector } from "@reduxjs/toolkit";
import { getIn, merge } from "icepick";
import inflection from "inflection"; // NOTE: need to use inflection directly here due to circular dependency
import { denormalize, normalize, schema } from "normalizr";
import createCachedSelector from "re-reselect";
import type React from "react";
import _ from "underscore";

import {
  type RequestsStateTree,
  requestsReducer,
  setRequestUnloaded,
} from "metabase/redux/requests";
import type { EntitiesState, State } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";

import { DELETE, GET, POST, PUT } from "./api";
import {
  combineReducers,
  compose,
  withAction,
  withCachedDataAndRequestState,
  withRequestState,
} from "./redux";

const EMPTY_ENTITY_QUERY = {};

export type EntityId = string | number;

/**
 * The minimum shape required of an entity object: anything with an `id`.
 * Concrete entity types (Collection, Card, Dashboard, …) extend this implicitly
 * by having an `id` field. We avoid an `[key: string]: unknown` index signature
 * because it would prevent narrower types from being assignable to `EntityObject`.
 */
export type EntityObject = {
  id: EntityId;
  name?: string;
  collection?: unknown;
};

type NormalizedPayload = {
  entities?: Record<string, Record<EntityId, EntityObject>>;
  result?: EntityId | EntityId[];
};

type EntityAction = {
  payload?: NormalizedPayload;
};

// The entity framework is a runtime abstraction — consumers define selectors,
// action creators, and object methods with per-entity concrete types that can't be
// statically expressed here. These aliases document the intent of each `any`:

/** Redux dispatch accepted by entity actions. */

type AnyDispatch = (action: any) => any;
/** Redux getState accepted by entity thunks. */

type AnyGetState = () => any;
/** Action creator produced by `entity.actions` / `entity.objectActions`. Each entity
 *  defines its own specific signatures, so we use a broad callable type here. */

type EntityActionCreator = (...args: any[]) => any;
/** Entity selector signature. Each entity defines its own specific selector signatures. */

type EntitySelector = (state: any, ...args: any[]) => any;
/** Entity query passed to list/fetch endpoints. Concrete shape depends on the entity. */

type EntityQuery = any;

/** Named selectors that every entity must expose. */
export type EntitySelectors = {
  getObject: EntitySelector;
  getList: EntitySelector;
  getEntityIds: EntitySelector;
  getLoading: EntitySelector;
  getLoaded: EntitySelector;
  getFetched: EntitySelector;
  getError: EntitySelector;
  getListMetadata: EntitySelector;
  getInitialCollectionId: EntitySelector;
  getExpandedCollectionsById: EntitySelector;
};

/** Shape returned by createEntity */
export type Entity = {
  // Names
  name: string;
  nameOne: string;
  nameMany: string;
  displayNameOne: string;
  displayNameMany: string;

  // Schema
  schema: schema.Entity;
  path?: string;

  // API — each method may accept any arguments (raw data + options objects)

  api: {
    list?: (...args: any[]) => Promise<
      | EntityObject[]
      | {
          data: EntityObject[];
          [key: string]: unknown;
        }
    >;
    create: (...args: any[]) => Promise<any>;
    get: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
    delete: (...args: any[]) => Promise<any>;
  };

  // Action type constants. The values are strings at runtime, but consumers use them
  // with `builder.addCase(actionType, reducer)` and rely on the second arg being typed
  // as a `PayloadAction<any>` (matching the JS framework's behaviour). Typing them as
  // `any` here preserves that ergonomic.
  actionTypes: {
    CREATE: any;

    FETCH: any;

    UPDATE: any;

    DELETE: any;

    FETCH_LIST: any;

    INVALIDATE_LISTS_ACTION: any;

    [key: string]: any;
  };

  actionDecorators: Record<
    string,
    (action: EntityActionCreator) => EntityActionCreator
  >;

  // Path helpers
  getQueryKey: (entityQuery: EntityQuery) => string;
  getObjectStatePath: (entityId: EntityId) => (string | EntityId)[];
  getListStatePath: (entityQuery: EntityQuery) => string[];

  // Normalize helpers
  normalize: (
    object: EntityObject,
    entitySchema?: schema.Entity,
  ) => NormalizedPayload & { object: EntityObject };
  normalizeList: (
    list: EntityObject[],
    entitySchema?: schema.Entity,
  ) => NormalizedPayload & { list: EntityObject[] };

  // Actions (thunk action creators) — each entity defines its own signatures
  objectActions: Record<string, EntityActionCreator> & {
    fetch: EntityActionCreator;
    create: EntityActionCreator;
    update: EntityActionCreator;
    delete: EntityActionCreator;
  };

  actions: Record<string, EntityActionCreator> & {
    fetchList: EntityActionCreator;
    invalidateLists: EntityActionCreator;
    fetch: EntityActionCreator;
    create: EntityActionCreator;
    update: EntityActionCreator;
    delete: EntityActionCreator;
  };

  // Extract entity from dispatched action result. The return type depends on the
  // action's normalized payload and is best handled dynamically by consumers.

  HACK_getObjectFromAction: (action: any) => any;

  // Selectors
  selectors: EntitySelectors;

  // Per-entity object accessors. Each entity defines these with its own object type.
  objectSelectors: Record<string, (object: any, ...args: any[]) => any>;

  // Reducers
  reducer?: EntitiesReducer;
  reducers: Record<string, EntitiesReducer | Reducer<Record<string, unknown>>>;
  requestsReducer: (
    state: RequestsStateTree,
    action: { type: string },
  ) => RequestsStateTree;
  actionShouldInvalidateLists: (action: { type: string }) => boolean;

  // Writable properties (subset of entity fields sent to the API)
  writableProperties?: string[];

  // Wrap entity object with bound selectors/actions. The wrapper preserves the
  // input's properties and adds the entity's bound objectSelectors/objectActions
  // (e.g. `getName()`, `getIcon()`). Each entity defines its own object methods,
  // so we return `any` to allow consumers to use any wrapper-provided method.
  wrapEntity: (object: any, dispatch?: AnyDispatch | null) => any;

  // HOC factories and JSX components added by addEntityContainers at construction time.
  // These are always present on the returned entity, so consumers can rely on them.
  /** @deprecated HOCs are deprecated */

  load: (opts?: Record<string, unknown>) => any;
  /** @deprecated HOCs are deprecated */

  loadList: (opts?: Record<string, unknown>) => any;

  ListLoader: React.ComponentType<any>;
  // Accept nullable/undefined IDs: consumers commonly pass optional dashboard/card ids
  Name: React.ComponentType<
    { id: EntityId | null | undefined } & Record<string, any>
  >;
};

/**
 * Optional RTK Query bridge that a few entities use to expose RTK Query hooks
 * through the entity abstraction. Structure is deliberately loose — each entity
 * attaches a different set of helpers.
 */

type EntityRtkBridge = Record<string, any>;
type EntitiesReducer = Reducer<
  Partial<EntitiesState> | undefined,
  { type: string; payload: EntitiesState }
>;

type EntityDef = {
  name: string;
  nameOne?: string;
  nameMany?: string;
  displayNameOne?: string;
  displayNameMany?: string;
  path?: string;
  schema?: schema.Entity;
  api?: Partial<Entity["api"]>;
  writableProperties?: string[];
  actionTypes?: Record<string, string>;
  actionDecorators?: Record<
    string,
    (action: EntityActionCreator) => EntityActionCreator
  >;
  objectActions?: Record<string, EntityActionCreator>;
  actions?: Record<string, EntityActionCreator>;
  selectors?: Partial<EntitySelectors>;
  createSelectors?: (
    defaultSelectors: Partial<EntitySelectors>,
  ) => Partial<EntitySelectors>;
  objectSelectors?: Partial<Entity["objectSelectors"]>;
  // Reducers in entity defs typically destructure `{ type, payload }` from the action
  // and accept any payload shape, so we type the action loosely here.

  reducer?: EntitiesReducer;
  wrapEntity?: Entity["wrapEntity"];
  requestsReducer?: Entity["requestsReducer"];
  actionShouldInvalidateLists?: Entity["actionShouldInvalidateLists"];
  rtk?: EntityRtkBridge;
  // Per-entity custom fields (e.g. `getAnalyticsMetadata`, `form`, `forms`).
  // These are attached to the entity object and used by entity-aware machinery.

  [key: string]: any;
};

// helper for working with normalizr
// merge each entity from newEntities with existing entity, if any
// this ensures partial entities don't overwrite existing entities with more properties
export function mergeEntities<T = EntitiesState>(
  entities: T,
  newEntities: Partial<T>,
): T {
  const result = { ...entities };
  // Casting is necessary here because Object.keys always returns string[]
  const ids = Object.keys(newEntities) as Array<keyof T>;

  for (const id of ids) {
    const entry = newEntities[id];
    if (entry == null) {
      delete result[id];
    } else {
      result[id] = { ...(result[id] ?? {}), ...entry };
    }
  }
  return result;
}

// helper for working with normalizr
// reducer that merges payload.entities
export function handleEntities(
  actionPattern: RegExp,
  entityType: string,
  reducer?: EntitiesReducer,
): EntitiesReducer {
  return (state, action) => {
    const entities = getIn(action, ["payload", "entities", entityType]);
    if (state && actionPattern.test(action.type) && entities) {
      state = mergeEntities(state, entities);
    }
    return reducer?.(state, action) ?? state ?? {};
  };
}

/**
 * @deprecated use "metabase/api" instead
 */
export function createEntity(def: EntityDef): Entity {
  // We use a mutable object internally during construction
  // then return it typed as Entity at the end.
  const entity = { ...def } as Entity;

  if (!entity.nameOne) {
    entity.nameOne = inflection.singularize(entity.name);
  }
  if (!entity.nameMany) {
    entity.nameMany = entity.name;
  }

  if (!entity.displayNameOne) {
    entity.displayNameOne = entity.nameOne;
  }
  if (!entity.displayNameMany) {
    entity.displayNameMany = entity.nameMany;
  }

  // defaults
  if (!entity.schema) {
    entity.schema = new schema.Entity(entity.name);
  }

  if (entity.path) {
    const path = entity.path;
    const defaultApi: Entity["api"] = {
      list: GET(`${path}`),
      create: POST(`${path}`),
      get: GET(`${path}/:id`),
      update: PUT(`${path}/:id`),
      delete: DELETE(`${path}/:id`),
    };
    // merge: user-provided overrides win over path-derived defaults
    entity.api = { ...defaultApi, ...entity.api };
  }

  const getQueryKey = (entityQuery: EntityQuery): string =>
    JSON.stringify(entityQuery || null);
  const getObjectStatePath = (entityId: EntityId): (string | EntityId)[] => [
    "entities",
    entity.name,
    entityId,
  ];
  const getListStatePath = (entityQuery: EntityQuery): string[] =>
    ["entities", entity.name + "_list"].concat(getQueryKey(entityQuery));

  entity.getQueryKey = getQueryKey;
  entity.getObjectStatePath = getObjectStatePath;
  entity.getListStatePath = getListStatePath;

  const getWritableProperties = (object: EntityObject): Partial<EntityObject> =>
    entity.writableProperties != null
      ? _.pick(object, "id", ...entity.writableProperties)
      : object;

  // ACTION TYPES
  const CREATE_ACTION = `metabase/entities/${entity.name}/CREATE`;
  const FETCH_ACTION = `metabase/entities/${entity.name}/FETCH`;
  const UPDATE_ACTION = `metabase/entities/${entity.name}/UPDATE`;
  const DELETE_ACTION = `metabase/entities/${entity.name}/DELETE`;
  const FETCH_LIST_ACTION = `metabase/entities/${entity.name}/FETCH_LIST`;
  const INVALIDATE_LISTS_ACTION = `metabase/entities/${entity.name}/INVALIDATE_LISTS`;

  entity.actionTypes = {
    CREATE: CREATE_ACTION,
    FETCH: FETCH_ACTION,
    UPDATE: UPDATE_ACTION,
    DELETE: DELETE_ACTION,
    FETCH_LIST: FETCH_LIST_ACTION,
    INVALIDATE_LISTS_ACTION: INVALIDATE_LISTS_ACTION,
    ...(def.actionTypes || {}),
  };

  entity.actionDecorators = {
    ...(def.actionDecorators || {}),
  };

  // normalize helpers
  entity.normalize = (
    object: EntityObject,
    entitySchema: schema.Entity = entity.schema,
  ) => ({
    object,
    [entity.nameOne]: object,
    ...normalize(object, entitySchema),
  });

  entity.normalizeList = (
    list: EntityObject[],
    entitySchema: schema.Entity = entity.schema,
  ) => ({
    list,
    [entity.nameMany]: list,
    ...normalize(list, [entitySchema]),
  });

  // thunk decorators:

  // same as withRequestState, but with automatic prefix

  function withEntityRequestState(
    getSubStatePath: (...args: any[]) => (string | EntityId)[],
  ) {
    return withRequestState((...args: any[]) => [
      "entities",
      entity.name,
      ...getSubStatePath(...args).map(String),
    ]);
  }

  function withEntityActionDecorators(
    action: string,
  ): (fn: EntityActionCreator) => EntityActionCreator {
    return entity.actionDecorators[action] || ((fn: EntityActionCreator) => fn);
  }

  // `objectActions` are for actions that accept an entity as their first argument,
  // and they are bound to instances when `wrapped: true` is passed to `EntityListLoader`
  // compose(decorator, decorator)(fn) loses types through multiple levels; makeAction recovers them
  entity.objectActions = {
    fetch: compose<EntityActionCreator>(
      withAction(FETCH_ACTION),
      withCachedDataAndRequestState(
        ({ id }: { id: EntityId }) => [...getObjectStatePath(id).map(String)],
        ({ id }: { id: EntityId }) => [
          ...getObjectStatePath(id).map(String),
          "fetch",
        ],
        (entityQuery: EntityQuery) => getQueryKey(entityQuery),
      ),
      withEntityActionDecorators("fetch"),
    )(
      (entityQuery: EntityQuery, options: Record<string, unknown> = {}) =>
        async (dispatch: AnyDispatch, getState: AnyGetState) =>
          entity.normalize(
            await entity.api.get?.(entityQuery, options, dispatch, getState),
          ),
    ),

    create: compose<EntityActionCreator>(
      withAction(CREATE_ACTION),
      withEntityRequestState(() => ["create"]),
      withEntityActionDecorators("create"),
    )(
      (entityObject: EntityObject) =>
        async (dispatch: AnyDispatch, getState: AnyGetState) => {
          return entity.normalize(
            await entity.api.create?.(
              getWritableProperties(entityObject),
              dispatch,
              getState,
            ),
          );
        },
    ),

    update: compose<EntityActionCreator>(
      withAction(UPDATE_ACTION),
      withEntityRequestState((object: EntityObject) => [
        String(object.id),
        "update",
      ]),
      withEntityActionDecorators("update"),
    )(
      (
        entityObject: EntityObject,
        updatedObject: Partial<EntityObject> | null = null,
        {
          notify,
        }: {
          notify?: { undo?: boolean; subject?: string; verb?: string } | false;
        } = {},
      ) =>
        async (dispatch: AnyDispatch, getState: AnyGetState) => {
          // save the original object for undo
          const originalObject = getObject(getState(), {
            entityId: entityObject.id,
          });
          // If a second object is provided just take the id from the first and
          // update it with all the properties in the second
          if (updatedObject) {
            entityObject = { id: entityObject.id, ...updatedObject };
          }

          const result = entity.normalize(
            await entity.api.update?.(
              getWritableProperties(entityObject),
              dispatch,
              getState,
            ),
          );

          if (notify) {
            if (notify.undo) {
              // pick only the attributes that were updated
              const undoObject = _.pick(
                originalObject,
                ...Object.keys(updatedObject || {}),
              );
              dispatch(
                addUndo({
                  actions: [
                    entity.objectActions.update(
                      entityObject,
                      undoObject,
                      // don't show an undo for the undo
                      { notify: false },
                    ),
                  ],
                  ...notify,
                }),
              );
            } else {
              dispatch(addUndo(notify));
            }
          }
          return result;
        },
    ),

    delete: compose<EntityActionCreator>(
      withAction(DELETE_ACTION),
      withEntityRequestState((object: EntityObject) => [
        String(object.id),
        "delete",
      ]),
      withEntityActionDecorators("delete"),
    )(
      (entityObject: EntityObject) =>
        async (dispatch: AnyDispatch, getState: AnyGetState) => {
          await entity.api.delete?.(entityObject, dispatch, getState);
          return {
            entities: { [entity.name]: { [entityObject.id]: null } },
            result: entityObject.id,
          };
        },
    ),

    // user defined object actions should override defaults
    ...(def.objectActions || {}),
  };

  // ACTION CREATORS
  entity.actions = {
    fetchList: compose<EntityActionCreator>(
      withAction(FETCH_LIST_ACTION),
      withCachedDataAndRequestState(
        (entityQuery: EntityQuery) => [...getListStatePath(entityQuery)],
        (entityQuery: EntityQuery) => [
          ...getListStatePath(entityQuery),
          "fetch",
        ],
        (entityQuery: EntityQuery) => entity.getQueryKey(entityQuery),
      ),
    )(
      (entityQuery: EntityQuery = null) =>
        async (dispatch: AnyDispatch, getState: AnyGetState) => {
          const fetched = await entity.api.list?.(
            entityQuery || EMPTY_ENTITY_QUERY,
            dispatch,
            getState,
          );

          let results: EntityObject[] | undefined;
          let metadata: Record<string, unknown> = {};

          if (!fetched || _.isArray(fetched)) {
            results = fetched;
          } else {
            const { data, ...rest } = fetched;
            results = data;
            metadata = rest;
          }

          if (!Array.isArray(results)) {
            throw `Invalid response listing ${entity.name}`;
          }
          return {
            ...entity.normalizeList(results),
            metadata,
            entityQuery,
          };
        },
    ),

    invalidateLists: compose<EntityActionCreator>(
      withAction(INVALIDATE_LISTS_ACTION),
      withEntityActionDecorators("invalidateLists"),
    )(() => null),

    // user defined actions should override defaults
    ...entity.objectActions,
    ...(def.actions || {}),
  };

  entity.HACK_getObjectFromAction = (
    rawAction: EntityAction | undefined,
  ): EntityObject | EntityObject[] | NormalizedPayload | undefined => {
    const { payload } = rawAction ?? {};
    if (payload && "entities" in payload && "result" in payload) {
      if (Array.isArray(payload.result)) {
        return payload.result.map((id) => payload.entities![entity.name][id]);
      } else {
        return payload.entities![entity.name][payload.result!];
      }
    } else {
      return payload;
    }
  };

  // SELECTORS

  const getEntities = (state: State) => state.entities;
  const getSettings = (state: State) => state.settings;

  // OBJECT SELECTORS

  const getEntityId = (
    state: State,
    props: { params?: { entityId?: EntityId }; entityId?: EntityId },
  ): EntityId | undefined =>
    (props.params && props.params.entityId) || props.entityId;

  const getObject = createCachedSelector(
    [getEntities, getEntityId],
    (entities: EntitiesState, entityId: EntityId | undefined) =>
      denormalize(entityId, entity.schema, entities),
  )((state: State, { entityId }: { entityId?: EntityId } = {}) =>
    typeof entityId === "object"
      ? JSON.stringify(entityId)
      : entityId
        ? String(entityId)
        : "",
  );

  // LIST SELECTORS

  const getEntityQueryId = (
    state: any,
    props: { entityQuery?: EntityQuery } | null | undefined,
  ): string => getQueryKey(props?.entityQuery);

  const getEntityLists = createSelector([getEntities], (entities) => {
    return entities[`${entity.name}_list`] as
      | Record<string, { list?: EntityId[]; metadata?: unknown }>
      | undefined;
  });

  const getEntityList = createSelector(
    [getEntityQueryId, getEntityLists],
    (
      entityQueryId: string,
      lists:
        | Record<string, { list?: EntityId[]; metadata?: unknown }>
        | undefined,
    ) => lists?.[entityQueryId],
  );

  const getEntityIds = createSelector(
    [getEntityList],
    (entityList: { list?: EntityId[]; metadata?: unknown } | undefined) =>
      entityList?.list,
  );

  const getListMetadata = createSelector(
    [getEntityList],
    (entityList: { list?: EntityId[]; metadata?: unknown } | undefined) =>
      entityList?.metadata,
  );

  const getList = createCachedSelector(
    [getEntities, getEntityIds, getSettings],
    (
      entities: EntitiesState,
      entityIds: EntityId[] | undefined,
      settings: unknown,
    ) =>
      entityIds &&
      entityIds
        .map((entityId) =>
          entity.selectors.getObject({ entities, settings }, { entityId }),
        )
        .filter((e): e is EntityObject => e != null),
  )((state: any, props: { entityQuery?: EntityQuery } | null | undefined) =>
    props?.entityQuery ? JSON.stringify(props.entityQuery) : "",
  );

  // REQUEST STATE SELECTORS

  type RequestStateEntry = {
    loading?: boolean;
    loaded?: boolean;
    fetched?: boolean;
    error?: unknown;
    queryKey?: string;
    queryPromise?: Promise<unknown>;
  };

  const getStatePath = ({
    entityId,
    entityQuery,
  }: { entityId?: EntityId; entityQuery?: EntityQuery } = {}): (
    | string
    | EntityId
  )[] =>
    entityId != null
      ? getObjectStatePath(entityId)
      : getListStatePath(entityQuery);

  const getRequestStatePath = ({
    entityId,
    entityQuery,
    requestType = "fetch",
  }: {
    entityId?: EntityId;
    entityQuery?: EntityQuery;
    requestType?: string;
  } = {}): string[] => [
    "requests",
    ...getStatePath({ entityId, entityQuery }).map(String),
    requestType,
  ];

  const defaultRequestState: RequestStateEntry = {};
  const getRequestState = (
    state: EntitiesState,
    props?: {
      entityId?: EntityId;
      entityQuery?: EntityQuery;
      requestType?: string;
    },
  ): RequestStateEntry =>
    getIn(state, getRequestStatePath(props)) || defaultRequestState;

  const getLoading = createSelector(
    [getRequestState],
    (requestState: RequestStateEntry) => requestState.loading,
  );
  const getLoaded = createSelector(
    [getRequestState],
    (requestState: RequestStateEntry) => requestState.loaded,
  );
  const getFetched = createSelector(
    [getRequestState],
    (requestState: RequestStateEntry) => requestState.fetched,
  );
  const getError = createSelector(
    [getRequestState],
    (requestState: RequestStateEntry) => requestState.error,
  );

  // createSelector/createCachedSelector attach cache methods; cast to the clean selector types
  const defaultSelectors: Partial<EntitySelectors> = {
    getEntityIds,
    getList,
    getObject,
    getFetched,
    getLoading,
    getLoaded,
    getError,
    getListMetadata,
  };
  entity.selectors = {
    ...defaultSelectors,
    ...(def.selectors || {}),
    ...(def.createSelectors ? def.createSelectors(defaultSelectors) : {}),
  } as EntitySelectors;

  entity.objectSelectors = {
    getName(object: EntityObject) {
      return object.name;
    },
    getIcon(_object: EntityObject) {
      return { name: "unknown" };
    },
    getColor(_object: EntityObject): string | undefined {
      return undefined;
    },
    getCollection(object: EntityObject) {
      return object.collection;
    },
    ...(def.objectSelectors || {}),
  };

  // REDUCERS

  entity.reducers = {};

  entity.reducers[entity.name] = handleEntities(
    /^metabase\/entities\//,
    entity.name,
    def.reducer,
  );

  const listReducer: Reducer<Record<string, unknown>> = (
    state: Record<string, unknown> = {},
    action: {
      type: string;
      error?: boolean;
      payload?: Record<string, unknown>;
    },
  ) => {
    if (action.error) {
      return state;
    }
    if (action.type === FETCH_LIST_ACTION) {
      if (action.payload && action.payload.result) {
        const { entityQuery, metadata, result: list } = action.payload;
        return {
          ...state,
          [getQueryKey(entityQuery)]: {
            list,
            metadata,
          },
        };
      }
      // NOTE: only add/remove from the "default" list (no entityQuery)
      // TODO: just remove this entirely?
    } else if (action.type === CREATE_ACTION && state[""]) {
      return {
        ...state,
        "": (state[""] as EntityId[]).concat([
          action.payload!.result as EntityId,
        ]),
      };
    } else if (action.type === DELETE_ACTION && state[""]) {
      return {
        ...state,
        "": (state[""] as EntityId[]).filter(
          (id) => id !== action.payload!.result,
        ),
      };
    }
    return state;
  };
  entity.reducers[`${entity.name}_list`] = listReducer;

  // REQUEST STATE REDUCER

  if (!entity.actionShouldInvalidateLists) {
    entity.actionShouldInvalidateLists = (action: { type: string }) =>
      action.type === CREATE_ACTION ||
      action.type === DELETE_ACTION ||
      action.type === UPDATE_ACTION ||
      action.type === INVALIDATE_LISTS_ACTION;
  }

  entity.requestsReducer = (
    state: RequestsStateTree = {},
    action: { type: string },
  ) => {
    if (entity.actionShouldInvalidateLists(action)) {
      return requestsReducer(
        state,
        setRequestUnloaded(["entities", entity.name + "_list"]),
      );
    }
    return state ?? {};
  };

  // OBJECT WRAPPER

  if (!entity.wrapEntity) {
    class EntityWrapper {
      [key: string]: unknown;
      _dispatch: AnyDispatch | null;

      constructor(
        object: { id: EntityId },
        dispatch: AnyDispatch | null = null,
      ) {
        Object.assign(this, object);
        this._dispatch = dispatch;
      }
    }
    // object selectors
    for (const [methodName, method] of Object.entries(entity.objectSelectors)) {
      if (method) {
        EntityWrapper.prototype[methodName] = function (
          this: EntityWrapper,
          ...args: unknown[]
        ) {
          return method(this, ...args);
        };
      }
    }
    // object actions
    for (const [methodName, method] of Object.entries(entity.objectActions)) {
      if (method) {
        EntityWrapper.prototype[methodName] = function (
          this: EntityWrapper,
          ...args: unknown[]
        ) {
          if (this._dispatch) {
            return this._dispatch(method(this, ...args));
          } else {
            return method(this, ...args);
          }
        };
      }
    }

    entity.wrapEntity = (
      object: any,
      dispatch: AnyDispatch | null = null,
    ): any => new EntityWrapper(object, dispatch);
  }

  // add container components and HOCs
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require to avoid circular dependency
  require("metabase/entities/containers").addEntityContainers(entity);

  return entity;
}

type CombinedEntities = {
  entities: Record<string, Entity>;
  reducers: Record<string, Reducer<Record<string, unknown>>>;
  reducer: Reducer<Record<string, Record<string, unknown>>>;
  requestsReducer: (
    state: RequestsStateTree | undefined,
    action: { type: string },
  ) => RequestsStateTree;
};

export function combineEntities(entities: Entity[]): CombinedEntities {
  const entitiesMap: Record<string, Entity> = {};
  const reducersMap: Record<string, Reducer<Record<string, unknown>>> = {};

  for (const entity of entities) {
    if (entity.name in entitiesMap) {
      console.warn(`Entity with name ${entity.name} already exists!`);
    } else {
      entitiesMap[entity.name] = entity;
      Object.assign(reducersMap, entity.reducers);
    }
  }

  const combinedRequestsReducer = (
    state: RequestsStateTree = {},
    action: { type: string },
  ): RequestsStateTree => {
    let current = state;
    for (const entity of entities) {
      if (entity.requestsReducer) {
        current = entity.requestsReducer(current, action);
      }
    }
    return current;
  };

  return {
    entities: entitiesMap,
    reducers: reducersMap,
    reducer: combineReducers(reducersMap),
    requestsReducer: combinedRequestsReducer,
  };
}

// OBJECT ACTION DECORATORS

export const notify = (
  opts: Record<string, unknown> = {},
  subject: string,
  verb: string,
) => merge({ notify: { subject, verb, undo: false } }, opts || {});

export const undo = (
  opts: Record<string, unknown> = {},
  subject: string,
  verb: string,
) => merge({ notify: { subject, verb, undo: true } }, opts || {});

/**
 * Structural minimum of an RTK Query endpoint descriptor. Concrete endpoints from
 * RTK Query carry many extra properties (hooks, selectors, etc.) and concrete
 * argument/result types — we only rely on `initiate` here.
 */

type RTKEndpoint = { initiate: (request: any, options: any) => any };

export async function entityCompatibleQuery(
  entityQuery: EntityQuery,
  dispatch: AnyDispatch,
  endpoint: RTKEndpoint,

  { forceRefetch = true } = {},
): Promise<any> {
  const request = entityQuery === EMPTY_ENTITY_QUERY ? undefined : entityQuery;
  const action = dispatch(endpoint.initiate(request, { forceRefetch }));

  try {
    return await action.unwrap();
  } finally {
    action.unsubscribe?.();
  }
}
