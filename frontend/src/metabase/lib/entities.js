/* @flow */

import {
  combineReducers,
  handleEntities,
  compose,
  withAction,
  withAnalytics,
  withRequestState,
  withCachedDataAndRequestState,
} from "metabase/lib/redux";
import createCachedSelector from "re-reselect";

import { addUndo } from "metabase/redux/undo";
import requestsReducer, { setRequestUnloaded } from "metabase/redux/requests";

import { GET, PUT, POST, DELETE } from "metabase/lib/api";

// NOTE: need to use inflection directly here due to circular dependency
import inflection from "inflection";

import { createSelector } from "reselect";
import { normalize, denormalize, schema } from "normalizr";
import { getIn, merge } from "icepick";
import _ from "underscore";

// entity defintions export the following properties (`name`, and `api` or `path` are required)
//
// name: plural, like "questions" or "dashboards"
// api: object containing `list`, `create`, `get`, `update`, `delete` methods (OR see `path` below)
// path: API endpoint to create default `api` object
// schema: normalizr schema, defaults to `new schema.Entity(entity.name)`
//

import type { APIMethod } from "metabase/lib/api";
import type { FormDefinition } from "metabase/containers/Form";

type EntityName = string;

type ActionType = string;
type ActionCreator = Function;
type ObjectActionCreator = Function;
type ObjectSelector = Function;

type Action = any;
export type Reducer = (state: any, action: Action) => any;

type EntityDefinition = {
  name: EntityName,

  nameOne?: string,
  nameMany?: string,

  form?: FormDefinition,
  forms?: { [key: string]: FormDefinition },

  displayNameOne?: string,
  displayNameMany?: string,

  schema?: schema.Entity,
  path?: string,
  api?: { [method: string]: APIMethod },
  actions?: {
    [name: string]: ActionCreator,
  },
  selectors?: {
    [name: string]: Function,
  },
  objectActions?: {
    [name: string]: ObjectActionCreator,
  },
  objectSelectors?: {
    [name: string]: ObjectSelector,
  },
  reducer?: Reducer,
  wrapEntity?: (object: EntityObject) => any,
  actionShouldInvalidateLists?: (action: Action) => boolean,

  // list of properties for this object which should be persisted
  writableProperties?: string[],
};

type EntityObject = any;

type EntityQuery = {
  [name: string]: string | number | boolean | null,
};

type FetchOptions = {
  reload?: boolean,
};
type UpdateOptions = {
  notify?:
    | { verb?: string, subject?: string, undo?: boolean, message?: any }
    | false,
};

type Result = any; // FIXME

export type Entity = {
  name: EntityName,

  nameOne: string,
  nameMany: string,

  displayNameOne: string,
  displayNameMany: string,

  form?: FormDefinition,
  forms?: { [key: string]: FormDefinition },

  path?: string,
  api: {
    list: APIMethod,
    create: APIMethod,
    get: APIMethod,
    update: APIMethod,
    delete: APIMethod,
    [method: string]: APIMethod,
  },
  schema: schema.Entity,
  actionTypes: {
    [name: string]: ActionType,
    CREATE: ActionType,
    FETCH: ActionType,
    UPDATE: ActionType,
    DELETE: ActionType,
    FETCH_LIST: ActionType,
  },
  actionDecorators: {
    [name: string]: Function, // TODO: better type
  },
  actions: {
    [name: string]: ActionCreator,
    fetchList: (
      entityQuery?: EntityQuery,
      options?: FetchOptions,
    ) => Promise<Result>,
  },
  reducers: { [name: string]: Reducer },
  selectors: {
    getList: Function,
    getObject: Function,
    getLoading: Function,
    getLoaded: Function,
    getFetched: Function,
    getError: Function,
    [name: string]: Function,
  },
  objectActions: {
    [name: string]: ObjectActionCreator,
    create: (entityObject: EntityObject) => Promise<Result>,
    fetch: (
      entityObject: EntityObject,
      options?: FetchOptions,
    ) => Promise<Result>,
    update: (
      entityObject: EntityObject,
      updatedObject: EntityObject,
      options?: UpdateOptions,
    ) => Promise<Result>,
    delete: (entityObject: EntityObject) => Promise<Result>,
  },
  objectSelectors: {
    [name: string]: ObjectSelector,
  },
  wrapEntity: (object: EntityObject) => any,

  requestsReducer: Reducer,
  actionShouldInvalidateLists: (action: Action) => boolean,

  writableProperties?: string[],
  getAnalyticsMetadata?: () => any,

  normalize: (object: EntityObject, schema?: schema.Entity) => any, // FIXME: return type
  normalizeList: (list: EntityObject[], schema?: schema.Entity) => any, // FIXME: return type

  getObjectStatePath: Function,
  getListStatePath: Function,

  HACK_getObjectFromAction: (action: Action) => any,
};

export function createEntity(def: EntityDefinition): Entity {
  // $FlowFixMe
  const entity: Entity = { ...def };

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

  const getIdForQuery = entityQuery => JSON.stringify(entityQuery || null);

  const getObjectStatePath = entityId => ["entities", entity.name, entityId];
  const getListStatePath = entityQuery =>
    ["entities", entity.name + "_list"].concat(getIdForQuery(entityQuery));

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
    // include raw `object` (and alias under nameOne) for convienence
    object,
    [entity.nameOne]: object,
    // include standard normalizr properties, `result` and `entities`
    ...normalize(object, schema),
  });

  entity.normalizeList = (list, schema = entity.schema) => ({
    // include raw `list` (and alias under nameMany) for convienence
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

  entity.objectActions = {
    fetch: compose(
      withAction(FETCH_ACTION),
      withCachedDataAndRequestState(
        ({ id }) => [...getObjectStatePath(id)],
        ({ id }) => [...getObjectStatePath(id), "fetch"],
      ),
      withEntityActionDecorators("fetch"),
    )(entityObject => async (dispatch, getState) =>
      entity.normalize(await entity.api.get({ id: entityObject.id })),
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
      (entityObject, updatedObject = null, { notify } = {}) => async (
        dispatch,
        getState,
      ) => {
        // save the original object for undo
        const originalObject = entity.selectors.getObject(getState(), {
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
            // $FlowFixMe
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
      await entity.api.delete({ id: entityObject.id });
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
      const results = fetched.data ? fetched.data : fetched;
      return {
        ...entity.normalizeList(results),
        entityQuery,
      };
    }),

    // user defined actions should override defaults
    ...entity.objectActions,
    ...(def.actions || {}),
  };

  // HACK: the above actions return the normalizr results
  // (i.e. { entities, result }) rather than the loaded object(s), except
  // for fetch and fetchList when the data is cached, in which case it returns
  // the noralized object.
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

  // OBJECT SELECTORS

  const getEntityId = (state, props) =>
    (props.params && props.params.entityId) || props.entityId;

  const getObject = createCachedSelector(
    [getEntities, getEntityId],
    (entities, entityId) => denormalize(entityId, entity.schema, entities),
  )((state, { entityId }) =>
    typeof entityId === "object" ? JSON.stringify(entityId) : entityId,
  ); // must stringify objects

  // LIST SELECTORS

  const getEntityQueryId = (state, props) =>
    getIdForQuery(props && props.entityQuery);

  const getEntityLists = createSelector(
    [getEntities],
    entities => entities[`${entity.name}_list`],
  );

  const getEntityIds = createSelector(
    [getEntityQueryId, getEntityLists],
    (entityQueryId, lists) => lists[entityQueryId],
  );

  const getList = createSelector(
    [state => state, getEntityIds],
    // delegate to getObject
    (state, entityIds) =>
      entityIds &&
      entityIds.map(entityId =>
        entity.selectors.getObject(state, { entityId }),
      ),
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

  entity.selectors = {
    getList,
    getObject,
    getFetched,
    getLoading,
    getLoaded,
    getError,
    ...(def.selectors || {}),
  };

  entity.objectSelectors = {
    getName(object) {
      return object.name;
    },
    getIcon(object) {
      return "unknown";
    },
    getColor(object) {
      return undefined;
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
        return {
          ...state,
          [getIdForQuery(payload.entityQuery)]: payload.result,
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
      _dispatch: ?(action: any) => any;

      constructor(object, dispatch = null) {
        Object.assign(this, object);
        this._dispatch = dispatch;
      }
    }
    // object selectors
    for (const [methodName, method] of Object.entries(entity.objectSelectors)) {
      if (method) {
        // $FlowFixMe
        EntityWrapper.prototype[methodName] = function(...args) {
          // $FlowFixMe
          return method(this, ...args);
        };
      }
    }
    // object actions
    for (const [methodName, method] of Object.entries(entity.objectActions)) {
      if (method) {
        // $FlowFixMe
        EntityWrapper.prototype[methodName] = function(...args) {
          if (this._dispatch) {
            // if dispatch was provided to the constructor go ahead and dispatch
            // $FlowFixMe
            return this._dispatch(method(this, ...args));
          } else {
            // otherwise just return the action
            // $FlowFixMe
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

type CombinedEntities = {
  entities: { [key: EntityName]: Entity },
  reducers: { [name: string]: Reducer },
  reducer: Reducer,
  requestsReducer: Reducer,
};

export function combineEntities(entities: Entity[]): CombinedEntities {
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

export const notify = (opts: any = {}, subject: string, verb: string) =>
  merge({ notify: { subject, verb, undo: false } }, opts || {});

export const undo = (opts: any = {}, subject: string, verb: string) =>
  merge({ notify: { subject, verb, undo: true } }, opts || {});

// decorator versions disabled due to incompatibility with current version of flow
//
// // merges in options to give an object action a notification
// export function notify(subject: string, verb: string, undo: boolean = false) {
//   return function(target: Object, name: string, descriptor: any) {
//     // https://github.com/loganfsmyth/babel-plugin-transform-decorators-legacy/issues/34
//     const original = descriptor.initializer
//       ? descriptor.initializer()
//       : descriptor.value;
//     delete descriptor.initializer;
//     descriptor.value = function(o, arg, opts = {}) {
//       opts = merge(
//         {
//           notify: {
//             subject: typeof subject === "function" ? subject(o, arg) : subject,
//             verb: typeof verb === "function" ? verb(o, arg) : verb,
//             undo,
//           },
//         },
//         opts,
//       );
//       return original(o, arg, opts);
//     };
//   };
// }
//
// // merges in options to give make object action undo-able
// export function undo(subject: string, verb: string) {
//   return notify(subject, verb, true);
// }
