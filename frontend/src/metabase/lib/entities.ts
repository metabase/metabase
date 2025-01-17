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

import { type AnyAction, createSelector } from "@reduxjs/toolkit";
import type {
  ApiEndpointMutation,
  ApiEndpointQuery,
} from "@reduxjs/toolkit/query";
import { getIn, merge } from "icepick";
import inflection from "inflection"; // NOTE: need to use inflection directly here due to circular dependency
import { denormalize, normalize, schema } from "normalizr";
import createCachedSelector from "re-reselect";
import _ from "underscore";

import {
  combineReducers,
  compose,
  handleEntities,
  withAction,
  withCachedDataAndRequestState,
  withRequestState,
} from "metabase/lib/redux";
import requestsReducer, { setRequestUnloaded } from "metabase/redux/requests";
import { addUndo } from "metabase/redux/undo";
import type { IconName } from "metabase/ui";
import type { Dispatch, GetState, State } from "metabase-types/store";

import type {
  $TS_FIXME,
  Entity,
  EntityDefinition,
  EntityId,
  EntityObjectId,
  EntityQuery,
  EntityState,
} from "./entities-types";

const EMPTY_ENTITY_QUERY: EntityQuery = {};

/**
 * @deprecated use "metabase/api" instead
 */
export function createEntity<EntityObject extends { id: EntityId }>(
  def: EntityDefinition<EntityObject>,
) {
  const nameOne = def.nameOne ?? inflection.singularize(def.name);
  const nameMany = def.nameMany ?? def.name;
  const displayNameOne =
    def.displayNameOne ?? def.nameOne ?? inflection.singularize(def.name);
  const displayNameMany = def.displayNameMany ?? def.nameMany ?? def.name;

  // ACTION TYPES
  const CREATE_ACTION = `metabase/entities/${def.name}/CREATE`;
  const FETCH_ACTION = `metabase/entities/${def.name}/FETCH`;
  const UPDATE_ACTION = `metabase/entities/${def.name}/UPDATE`;
  const DELETE_ACTION = `metabase/entities/${def.name}/DELETE`;
  const FETCH_LIST_ACTION = `metabase/entities/${def.name}/FETCH_LIST`;
  const INVALIDATE_LISTS_ACTION = `metabase/entities/${def.name}/INVALIDATE_LISTS`;

  const actionShouldInvalidateLists =
    def.actionShouldInvalidateLists ??
    ((action: $TS_FIXME) => {
      return (
        action.type === CREATE_ACTION ||
        action.type === DELETE_ACTION ||
        action.type === UPDATE_ACTION ||
        action.type === INVALIDATE_LISTS_ACTION
      );
    });

  const actionTypes = {
    CREATE: CREATE_ACTION,
    FETCH: FETCH_ACTION,
    UPDATE: UPDATE_ACTION,
    DELETE: DELETE_ACTION,
    FETCH_LIST: FETCH_LIST_ACTION,
    INVALIDATE_LISTS_ACTION: INVALIDATE_LISTS_ACTION,
    ...(def.actionTypes || {}),
  };

  const getQueryKey = (entityQuery: EntityQuery | undefined) =>
    JSON.stringify(entityQuery || null);
  const getObjectStatePath = (
    entityId: EntityId,
  ): ["entities", string, EntityId] => ["entities", entity.name, entityId];
  const getListStatePath = (
    entityQuery: EntityQuery | undefined,
  ): ["entities", string, string] => [
    "entities",
    entity.name + "_list",
    getQueryKey(entityQuery),
  ];

  const getWritableProperties = (object: EntityObject) =>
    def.writableProperties != null
      ? _.pick(object, "id", ...def.writableProperties)
      : object;

  // thunk decorators:

  // same as withRequestState, but with automatic prefix
  function withEntityRequestState(
    getSubStatePath: (object: EntityObjectId) => Array<string | number>,
  ) {
    return withRequestState((...args: [EntityObjectId]) => [
      "entities",
      entity.name,
      ...getSubStatePath(...args),
    ]);
  }

  function withEntityActionDecorators(action: string) {
    return def.actionDecorators?.[action] || (_ => _);
  }

  // `objectActions` are for actions that accept an entity as their first argument,
  // and they are bound to instances when `wrapped: true` is passed to `EntityListLoader`
  const objectActions = {
    fetch: compose(
      withAction(FETCH_ACTION),
      withCachedDataAndRequestState(
        ({ id }: EntityObjectId) => [...getObjectStatePath(id)],
        ({ id }: EntityObjectId) => [...getObjectStatePath(id), "fetch"],
        (entityQuery: EntityQuery) => getQueryKey(entityQuery),
      ),
      withEntityActionDecorators("fetch"),
    )(
      (entityQuery: EntityQuery, options = {}) =>
        async (dispatch: Dispatch, getState: GetState) =>
          entity.normalize(
            await entity.api.get(entityQuery, options, dispatch, getState),
          ),
    ),

    create: compose(
      withAction(CREATE_ACTION),
      withEntityRequestState(() => ["create"]),
      withEntityActionDecorators("create"),
    )(
      (entityObject: EntityObject) =>
        async (dispatch: Dispatch, getState: GetState) => {
          return entity.normalize(
            await entity.api.create(
              getWritableProperties(entityObject),
              dispatch,
              getState,
            ),
          );
        },
    ),

    update: compose(
      withAction(UPDATE_ACTION),
      withEntityRequestState((object: EntityObjectId) => [object.id, "update"]),
      withEntityActionDecorators("update"),
    )(
      (
        entityObject: EntityObject,
        updatedObject: Omit<EntityObject, "id"> | null = null,
        { notify }: { notify: boolean | { undo: boolean } } = { notify: false },
      ) =>
        async (dispatch: Dispatch, getState: GetState) => {
          // save the original object for undo
          const originalObject = getObject(getState(), {
            entityId: entityObject.id,
          });
          // If a second object is provided just take the id from the first and
          // update it with all the properties in the second
          // NOTE: this is so that the object.update(updatedObject) method on
          // the default entity wrapper class works correctly
          if (updatedObject) {
            entityObject = {
              id: entityObject.id,
              ...updatedObject,
            } as EntityObject;
          }

          const result = entity.normalize(
            await entity.api.update(
              getWritableProperties(entityObject),
              dispatch,
              getState,
            ),
          );

          if (notify) {
            if (typeof notify !== "boolean" && notify.undo) {
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

    delete: compose(
      withAction(DELETE_ACTION),
      withEntityRequestState(object => [object.id, "delete"]),
      withEntityActionDecorators("delete"),
    )(
      (entityObject: EntityObject) =>
        async (dispatch: Dispatch, getState: GetState) => {
          await entity.api.delete(entityObject, dispatch, getState);
          return {
            entities: { [entity.name]: { [entityObject.id]: null } },
            result: entityObject.id,
          };
        },
    ),

    // user defined object actions should override defaults
    ...(def.objectActions || {}),
  };

  // normalize helpers
  const normalizeFn = (object: $TS_FIXME, schema = entity.schema) => ({
    // include raw `object` (and alias under nameOne) for convenience
    object,
    [entity.nameOne]: object,
    // include standard normalizr properties, `result` and `entities`
    ...normalize(object, schema),
  });

  const normalizeList = (list: $TS_FIXME[], schema = entity.schema) => ({
    // include raw `list` (and alias under nameMany) for convenience
    list,
    [entity.nameMany]: list,
    // include standard normalizr properties, `result` and `entities`
    ...normalize(list, [schema]),
  });

  // ACTION CREATORS
  const actions = {
    fetchList: compose(
      withAction(FETCH_LIST_ACTION),
      withCachedDataAndRequestState(
        (entityQuery: EntityQuery) => [...getListStatePath(entityQuery)],
        (entityQuery: EntityQuery) => [
          ...getListStatePath(entityQuery),
          "fetch",
        ],
      ),
    )(
      (entityQuery = null) =>
        async (dispatch: Dispatch, getState: GetState) => {
          const fetched = await entity.api.list(
            entityQuery || EMPTY_ENTITY_QUERY,
            dispatch,
            getState,
          );
          // for now at least paginated endpoints have a 'data' property that
          // contains the actual entries, if that is on the response we should
          // use that as the 'results'

          let results;
          let metadata = {};

          if (fetched.data) {
            const { data, ...rest } = fetched;
            results = data;
            metadata = rest;
          } else {
            results = fetched;
          }

          if (!Array.isArray(results)) {
            throw `Invalid response listing ${entity.name}`;
          }
          return {
            ...normalizeList(results),
            metadata,
            entityQuery,
          };
        },
    ),

    invalidateLists: compose(
      withAction(INVALIDATE_LISTS_ACTION),
      withEntityActionDecorators("invalidateLists"),
    )(() => null),

    // user defined actions should override defaults
    ...objectActions,
    ...(def.actions || {}),
  };

  // HACK: the above actions return the normalizr results
  // (i.e. { entities, result }) rather than the loaded object(s), except
  // for fetch and fetchList when the data is cached, in which case it returns
  // the normalized object.
  //
  // This is a problem when we use the result of one of the actions as though
  // though the action creator was an API client.
  //
  // For now just use this function until we figure out a cleaner way to do
  // this. It will make it easy to find instances where we use the result of an
  // action, and ensures a consistent result
  //
  // NOTE: this returns the normalized object(s), nested objects defined in
  // the schema will be replaced with IDs.
  //
  // NOTE: A possible solution is to have an `updateEntities` action which is
  // dispatched by the actions with the normalized data so that we can return
  // the denormalized data from the action itself.
  //
  const HACK_getObjectFromAction = ({
    payload,
  }: {
    payload: $TS_FIXME | $TS_FIXME[];
  }) => {
    if (payload && "entities" in payload && "result" in payload) {
      if (Array.isArray(payload.result)) {
        return payload.result.map(
          (id: $TS_FIXME) => payload.entities[entity.name][id],
        );
      } else {
        return payload.entities[entity.name][payload.result];
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
    _state: EntityState,
    props:
      | { params: { entityId: EntityId }; entityId?: never }
      | { params?: never; entityId: EntityId },
  ) => (props.params && props.params.entityId) || props.entityId;

  const getObject = createCachedSelector(
    [getEntities, getEntityId],
    (entities, entityId) => denormalize(entityId, entity.schema, entities),
  )((_state, { entityId }: { entityId?: EntityId } = {}) =>
    typeof entityId === "object"
      ? JSON.stringify(entityId)
      : entityId
        ? entityId
        : "",
  ); // must stringify objects

  // LIST SELECTORS

  const getEntityQueryId = (
    _state: EntityState,
    props: { entityQuery: EntityQuery },
  ) => getQueryKey(props && props.entityQuery);

  const getEntityLists = createSelector(
    [getEntities],
    entities => (entities as $TS_FIXME)[`${entity.name}_list`],
  );

  const getEntityList = createSelector(
    [getEntityQueryId, getEntityLists],
    (entityQueryId, lists) => lists[entityQueryId],
  );

  const getEntityIds = createSelector(
    [getEntityList],
    entities => entities && entities.list,
  );

  const getListMetadata = createSelector(
    [getEntityList],
    entities => entities && entities.metadata,
  );

  const getList = createCachedSelector(
    [getEntities, getEntityIds, getSettings],
    // delegate to getObject
    (entities, entityIds, settings) =>
      entityIds &&
      entityIds
        .map((entityId: EntityId) =>
          entity.selectors.getObject({ entities, settings }, { entityId }),
        )
        .filter((e: $TS_FIXME) => e != null), // deleted entities might remain in lists,
  )((_state, { entityQuery }: { entityQuery?: EntityQuery } = {}) =>
    entityQuery ? JSON.stringify(entityQuery) : "",
  );

  // REQUEST STATE SELECTORS

  const getStatePath = ({
    entityId,
    entityQuery,
  }: { entityId?: EntityId; entityQuery?: EntityQuery } = {}) =>
    entityId != null
      ? getObjectStatePath(entityId)
      : getListStatePath(entityQuery);

  const getRequestStatePath = ({
    entityId = undefined,
    entityQuery = undefined,
    requestType = "fetch",
  }: {
    entityId?: EntityId | undefined;
    entityQuery?: EntityQuery | undefined;
    requestType?: string;
  } = {}) => [
    "requests",
    ...getStatePath({ entityId, entityQuery }),
    requestType,
  ];

  const defaultRequestState = {};
  const getRequestState = (
    state: EntityState,
    props: {
      entityId: EntityId;
      entityQuery: EntityQuery;
      requestType?: string;
    },
  ) => getIn(state, getRequestStatePath(props)) || defaultRequestState;

  const getLoading = createSelector(
    [getRequestState],
    requestState => requestState.loading,
  );
  const getLoaded = createSelector(
    [getRequestState],
    requestState => requestState.loaded,
  );
  const getFetched = createSelector(
    [getRequestState],
    requestState => requestState.fetched,
  );
  const getError = createSelector(
    [getRequestState],
    requestState => requestState.error,
  );

  const defaultSelectors = {
    getEntityIds,
    getList,
    getObject,
    getFetched,
    getLoading,
    getLoaded,
    getError,
    getListMetadata,
  };

  const selectors = {
    ...defaultSelectors,
    ...(def.selectors || {}),
    ...(def.createSelectors ? def.createSelectors(defaultSelectors) : {}),
  };

  const objectSelectors = {
    getName(object: $TS_FIXME) {
      return object.name;
    },
    getIcon(_object: $TS_FIXME) {
      return { name: "unknown" as IconName };
    },
    getColor(_object: $TS_FIXME) {
      return undefined;
    },
    getCollection(object: $TS_FIXME) {
      return object.collection;
    },
    ...(def.objectSelectors || {}),
  };

  // REDUCERS

  const reducers = {} as Record<string, $TS_FIXME>;
  reducers[def.name] = handleEntities(
    /^metabase\/entities\//,
    def.name,
    def.reducer as $TS_FIXME,
  );

  reducers[def.name + "_list"] = (
    state: $TS_FIXME = {},
    { type, error, payload }: AnyAction,
  ) => {
    if (error) {
      return state;
    }
    if (type === FETCH_LIST_ACTION) {
      if (payload && payload.result) {
        const { entityQuery, metadata, result: list } = payload;
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
    } else if (type === CREATE_ACTION && state[""]) {
      return { ...state, "": state[""].concat([payload.result]) };
    } else if (type === DELETE_ACTION && state[""]) {
      return {
        ...state,
        "": state[""].filter((id: EntityId) => id !== payload.result),
      };
    }
    return state;
  };

  // REQUEST STATE REDUCER

  // NOTE: ideally we'd only reset lists where there's a possibility the action,
  // or even better, add/remove the item from appropriate lists in the reducer
  // above. This will be difficult with pagination

  const entityRequestsReducer = (state: State, action: AnyAction): State => {
    // reset all list request states when creating, deleting, or updating
    // to force a reload
    if (entity.actionShouldInvalidateLists(action)) {
      return requestsReducer(
        state,
        (setRequestUnloaded as $TS_FIXME)(["entities", entity.name + "_list"]),
      ) as $TS_FIXME;
    }
    return state;
  };

  // OBJECT WRAPPER

  // This is the entity wrapper class implementation
  //
  // We automatically bind all objectSelectors and objectActions functions
  //
  // If a dispatch function is passed to the constructor the actions will be
  // dispatched using it, otherwise the actions will be returned
  //
  class EntityWrapper {
    _dispatch: Dispatch | null;

    constructor(object: $TS_FIXME, dispatch: Dispatch | null = null) {
      Object.assign(this, object);
      this._dispatch = dispatch;
    }
  }

  // object selectors
  for (const [methodName, method] of Object.entries(objectSelectors)) {
    if (method) {
      // @ts-expect-error - type fix requires editing code, keeping it as is since it has worked for years
      (EntityWrapper.prototype as $TS_FIXME)[methodName] = function (...args) {
        return method(this, ...args);
      };
    }
  }
  // object actions
  for (const [methodName, method] of Object.entries(objectActions)) {
    if (method) {
      (EntityWrapper.prototype as $TS_FIXME)[methodName] = function (
        ...args: $TS_FIXME[]
      ) {
        if (this._dispatch) {
          // if dispatch was provided to the constructor go ahead and dispatch
          return this._dispatch(method(this, ...args));
        } else {
          // otherwise just return the action
          return method(this, ...args);
        }
      };
    }
  }

  const wrapEntity =
    def.wrapEntity ??
    ((object: $TS_FIXME, dispatch: Dispatch | null = null) =>
      new EntityWrapper(object, dispatch));

  const entity: Entity<EntityObject> = {
    ...def,
    schema: def.schema ?? new schema.Entity(def.name),
    nameOne,
    nameMany,
    displayNameOne,
    displayNameMany,
    actionShouldInvalidateLists,
    actionTypes,
    actionDecorators: {
      ...(def.actionDecorators || {}),
    },
    getQueryKey,
    getObjectStatePath,
    getListStatePath,
    objectActions,
    objectSelectors,
    normalize: normalizeFn,
    normalizeList,
    wrapEntity,
    actions,
    reducers,
    selectors,
    HACK_getObjectFromAction,
    requestsReducer: entityRequestsReducer,

    // all of these values are set addEntityContainers below
    load: undefined,
    loadList: undefined,
    Name: undefined,
  };

  // add container components and HOCs
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("metabase/entities/containers").addEntityContainers(entity);

  return entity;
}

export function combineEntities(entities: $TS_FIXME) {
  const entitiesMap: $TS_FIXME = {};
  const reducersMap = {};

  for (const entity of entities) {
    if (entity.name in entitiesMap) {
      console.warn(`Entity with name ${entity.name} already exists!`);
    } else {
      entitiesMap[entity.name] = entity;
      Object.assign(reducersMap, entity.reducers);
    }
  }

  const requestsReducer = (state: EntityState, action: AnyAction) => {
    for (const entity of entities) {
      if (entity.requestsReducer) {
        state = entity.requestsReducer(state, action);
      }
    }
    return state;
  };

  return {
    entities: entitiesMap,
    reducers: reducersMap,
    reducer: combineReducers(reducersMap),
    requestsReducer,
  };
}

// OBJECT ACTION DECORATORS

export const notify = (opts = {}, subject: string, verb: string) =>
  merge({ notify: { subject, verb, undo: false } }, opts || {});

export const undo = (opts = {}, subject: string, verb: string) =>
  merge({ notify: { subject, verb, undo: true } }, opts || {});
export async function entityCompatibleQuery(
  entityQuery: EntityQuery,
  dispatch: Dispatch,
  endpoint:
    | ApiEndpointQuery<$TS_FIXME, $TS_FIXME>
    | ApiEndpointMutation<$TS_FIXME, $TS_FIXME>,
  { forceRefetch = true } = {},
) {
  const request = entityQuery === EMPTY_ENTITY_QUERY ? undefined : entityQuery;
  const action = dispatch(
    endpoint.initiate(request, { forceRefetch }),
  ) as $TS_FIXME;

  try {
    return await action.unwrap();
  } finally {
    action.unsubscribe?.();
  }
}
