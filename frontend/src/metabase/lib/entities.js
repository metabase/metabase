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

import { createSelector } from "@reduxjs/toolkit";
import { getIn, merge } from "icepick";
import inflection from "inflection"; // NOTE: need to use inflection directly here due to circular dependency
import { normalize, denormalize, schema } from "normalizr";
import createCachedSelector from "re-reselect";
import _ from "underscore";

import { GET, PUT, POST, DELETE } from "metabase/lib/api";
import {
  combineReducers,
  handleEntities,
  compose,
  withAction,
  withAnalytics,
  withRequestState,
  withCachedDataAndRequestState,
} from "metabase/lib/redux";
import requestsReducer, { setRequestUnloaded } from "metabase/redux/requests";
import { addUndo } from "metabase/redux/undo";

export function createEntity(def) {
  const entity = { ...def };

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

  // API
  if (!entity.api) {
    entity.api = {};
  }
  if (entity.path) {
    const path = entity.path; // Flow not recognizing path won't be undefined
    entity.api = {
      list: GET(`${path}`),
      create: POST(`${path}`),
      get: GET(`${path}/:id`),
      update: PUT(`${path}/:id`),
      delete: DELETE(`${path}/:id`),
      ...entity.api,
    };
  }

  const getQueryKey = entityQuery => JSON.stringify(entityQuery || null);
  const getObjectStatePath = entityId => ["entities", entity.name, entityId];
  const getListStatePath = entityQuery =>
    ["entities", entity.name + "_list"].concat(getQueryKey(entityQuery));

  entity.getQueryKey = getQueryKey;
  entity.getObjectStatePath = getObjectStatePath;
  entity.getListStatePath = getListStatePath;

  const getWritableProperties = object =>
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
    ...(entity.actionTypes || {}),
  };

  entity.actionDecorators = {
    ...(entity.actionDecorators || {}),
  };

  // normalize helpers
  entity.normalize = (object, schema = entity.schema) => ({
    // include raw `object` (and alias under nameOne) for convenience
    object,
    [entity.nameOne]: object,
    // include standard normalizr properties, `result` and `entities`
    ...normalize(object, schema),
  });

  entity.normalizeList = (list, schema = entity.schema) => ({
    // include raw `list` (and alias under nameMany) for convenience
    list,
    [entity.nameMany]: list,
    // include standard normalizr properties, `result` and `entities`
    ...normalize(list, [schema]),
  });

  // thunk decorators:

  // same as withRequestState, but with automatic prefix
  function withEntityRequestState(getSubStatePath) {
    return withRequestState((...args) => [
      "entities",
      entity.name,
      ...getSubStatePath(...args),
    ]);
  }

  // same as withRequestState, but with category/label
  function withEntityAnalytics(action) {
    return withAnalytics(
      "entities",
      entity.name,
      action,
      entity.getAnalyticsMetadata,
    );
  }

  function withEntityActionDecorators(action) {
    return entity.actionDecorators[action] || (_ => _);
  }

  // `objectActions` are for actions that accept an entity as their first argument,
  // and they are bound to instances when `wrapped: true` is passed to `EntityListLoader`
  entity.objectActions = {
    fetch: compose(
      withAction(FETCH_ACTION),
      withCachedDataAndRequestState(
        ({ id }) => [...getObjectStatePath(id)],
        ({ id }) => [...getObjectStatePath(id), "fetch"],
        entityQuery => getQueryKey(entityQuery),
      ),
      withEntityActionDecorators("fetch"),
    )(
      (entityQuery, options = {}) =>
        async (dispatch, getState) =>
          entity.normalize(await entity.api.get(entityQuery, options)),
    ),

    create: compose(
      withAction(CREATE_ACTION),
      withEntityAnalytics("create"),
      withEntityRequestState(() => ["create"]),
      withEntityActionDecorators("create"),
    )(entityObject => async (dispatch, getState) => {
      return entity.normalize(
        await entity.api.create(getWritableProperties(entityObject)),
      );
    }),

    update: compose(
      withAction(UPDATE_ACTION),
      withEntityAnalytics("update"),
      withEntityRequestState(object => [object.id, "update"]),
      withEntityActionDecorators("update"),
    )(
      (entityObject, updatedObject = null, { notify } = {}) =>
        async (dispatch, getState) => {
          // save the original object for undo
          const originalObject = getObject(getState(), {
            entityId: entityObject.id,
          });
          // If a second object is provided just take the id from the first and
          // update it with all the properties in the second
          // NOTE: this is so that the object.update(updatedObject) method on
          // the default entity wrapper class works correctly
          if (updatedObject) {
            entityObject = { id: entityObject.id, ...updatedObject };
          }

          const result = entity.normalize(
            await entity.api.update(getWritableProperties(entityObject)),
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

    delete: compose(
      withAction(DELETE_ACTION),
      withEntityAnalytics("delete"),
      withEntityRequestState(object => [object.id, "delete"]),
      withEntityActionDecorators("delete"),
    )(entityObject => async (dispatch, getState) => {
      await entity.api.delete(entityObject);
      return {
        entities: { [entity.name]: { [entityObject.id]: null } },
        result: entityObject.id,
      };
    }),

    // user defined object actions should override defaults
    ...(def.objectActions || {}),
  };

  // ACTION CREATORS
  entity.actions = {
    fetchList: compose(
      withAction(FETCH_LIST_ACTION),
      withCachedDataAndRequestState(
        entityQuery => [...getListStatePath(entityQuery)],
        entityQuery => [...getListStatePath(entityQuery), "fetch"],
      ),
    )((entityQuery = null) => async (dispatch, getState) => {
      const fetched = await entity.api.list(entityQuery || {});
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
        ...entity.normalizeList(results),
        metadata,
        entityQuery,
      };
    }),

    invalidateLists: compose(
      withAction(INVALIDATE_LISTS_ACTION),
      withEntityActionDecorators("invalidateLists"),
    )(() => null),

    // user defined actions should override defaults
    ...entity.objectActions,
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
  entity.HACK_getObjectFromAction = ({ payload }) => {
    if (payload && "entities" in payload && "result" in payload) {
      if (Array.isArray(payload.result)) {
        return payload.result.map(id => payload.entities[entity.name][id]);
      } else {
        return payload.entities[entity.name][payload.result];
      }
    } else {
      return payload;
    }
  };

  // SELECTORS

  const getEntities = state => state.entities;
  const getSettings = state => state.settings;

  // OBJECT SELECTORS

  const getEntityId = (state, props) =>
    (props.params && props.params.entityId) || props.entityId;

  const getObject = createCachedSelector(
    [getEntities, getEntityId],
    (entities, entityId) => denormalize(entityId, entity.schema, entities),
  )((state, { entityId } = {}) =>
    typeof entityId === "object"
      ? JSON.stringify(entityId)
      : entityId
      ? entityId
      : "",
  ); // must stringify objects

  // LIST SELECTORS

  const getEntityQueryId = (state, props) =>
    getQueryKey(props && props.entityQuery);

  const getEntityLists = createSelector(
    [getEntities],
    entities => entities[`${entity.name}_list`],
  );

  const getEntityList = createSelector(
    [getEntityQueryId, getEntityLists],
    (entityQueryId, lists) => {
      return lists[entityQueryId];
    },
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
        .map(entityId =>
          entity.selectors.getObject({ entities, settings }, { entityId }),
        )
        .filter(e => e != null), // deleted entities might remain in lists,
  )((state, { entityQuery } = {}) =>
    entityQuery ? JSON.stringify(entityQuery) : "",
  );

  // REQUEST STATE SELECTORS

  const getStatePath = ({ entityId, entityQuery } = {}) =>
    entityId != null
      ? getObjectStatePath(entityId)
      : getListStatePath(entityQuery);

  const getRequestStatePath = ({
    entityId,
    entityQuery,
    requestType = "fetch",
  } = {}) => [
    "requests",
    ...getStatePath({ entityId, entityQuery }),
    requestType,
  ];

  const getRequestState = (state, props) =>
    getIn(state, getRequestStatePath(props)) || {};

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
  entity.selectors = {
    ...defaultSelectors,
    ...(def.selectors || {}),
    ...(def.createSelectors ? def.createSelectors(defaultSelectors) : {}),
  };

  entity.objectSelectors = {
    getName(object) {
      return object.name;
    },
    getIcon(object) {
      return { name: "unknown" };
    },
    getColor(object) {
      return undefined;
    },
    getCollection(object) {
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

  entity.reducers[entity.name + "_list"] = (
    state = {},
    { type, error, payload },
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
        "": state[""].filter(id => id !== payload.result),
      };
    }
    return state;
  };

  // REQUEST STATE REDUCER

  // NOTE: ideally we'd only reset lists where there's a possibility the action,
  // or even better, add/remove the item from appropriate lists in the reducer
  // above. This will be difficult with pagination

  if (!entity.actionShouldInvalidateLists) {
    entity.actionShouldInvalidateLists = action =>
      action.type === CREATE_ACTION ||
      action.type === DELETE_ACTION ||
      action.type === UPDATE_ACTION ||
      action.type === INVALIDATE_LISTS_ACTION;
  }

  entity.requestsReducer = (state, action) => {
    // reset all list request states when creating, deleting, or updating
    // to force a reload
    if (entity.actionShouldInvalidateLists(action)) {
      return requestsReducer(
        state,
        setRequestUnloaded(["entities", entity.name + "_list"]),
      );
    }
    return state;
  };

  // OBJECT WRAPPER

  if (!entity.wrapEntity) {
    // This is the default entity wrapper class implementation
    //
    // We automatically bind all objectSelectors and objectActions functions
    //
    // If a dispatch function is passed to the constructor the actions will be
    // dispatched using it, otherwise the actions will be returned
    //
    class EntityWrapper {
      _dispatch;

      constructor(object, dispatch = null) {
        Object.assign(this, object);
        this._dispatch = dispatch;
      }
    }
    // object selectors
    for (const [methodName, method] of Object.entries(entity.objectSelectors)) {
      if (method) {
        EntityWrapper.prototype[methodName] = function (...args) {
          return method(this, ...args);
        };
      }
    }
    // object actions
    for (const [methodName, method] of Object.entries(entity.objectActions)) {
      if (method) {
        EntityWrapper.prototype[methodName] = function (...args) {
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

    entity.wrapEntity = (object, dispatch = null) =>
      new EntityWrapper(object, dispatch);
  }

  // add container components and HOCs
  require("metabase/entities/containers").addEntityContainers(entity);

  return entity;
}

export function combineEntities(entities) {
  const entitiesMap = {};
  const reducersMap = {};

  for (const entity of entities) {
    if (entity.name in entitiesMap) {
      console.warn(`Entity with name ${entity.name} already exists!`);
    } else {
      entitiesMap[entity.name] = entity;
      Object.assign(reducersMap, entity.reducers);
    }
  }

  const requestsReducer = (state, action) => {
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

export const notify = (opts = {}, subject, verb) =>
  merge({ notify: { subject, verb, undo: false } }, opts || {});

export const undo = (opts = {}, subject, verb) =>
  merge({ notify: { subject, verb, undo: true } }, opts || {});
