/* @flow */

import {
  combineReducers,
  createThunkAction,
  fetchData,
  handleEntities,
} from "metabase/lib/redux";
import { setRequestState } from "metabase/redux/requests";

import { GET, PUT, POST, DELETE } from "metabase/lib/api";

import { createSelector } from "reselect";
import { normalize, denormalize, schema } from "normalizr";
import { getIn } from "icepick";

// entity defintions export the following properties (`name`, and `api` or `path` are required)
//
// name: plural, like "questions" or "dashboards"
// api: object containing `list`, `create`, `get`, `update`, `delete` methods (OR see `path` below)
// path: API endpoint to create default `api` object
// schema: normalizr schema, defaults to `new schema.Entity(entity.name)`
//

import type { APIMethod } from "metabase/lib/api";

type EntityName = string;

type ActionCreator = Function;
type ObjectActionCreator = Function;
type ObjectSelector = Function;

type EntityDefinition = {
  name: EntityName,
  schema?: schema.Entity,
  path?: string,
  api?: { [method: string]: APIMethod },
  actions?: {
    [name: string]: ActionCreator,
  },
  objectActions?: {
    [name: string]: ObjectActionCreator,
  },
  objectSelectors?: {
    [name: string]: ObjectSelector,
  },
  reducer?: Reducer,
  wrapEntity?: (object: EntityObject) => any,
  form?: any,
};

type EntityObject = any;

export type Entity = {
  name: EntityName,
  path?: string,
  api: {
    list: APIMethod,
    create: APIMethod,
    get: APIMethod,
    update: APIMethod,
    delete: APIMethod,
  },
  schema: schema.Entity,
  actions: { [name: string]: ActionCreator },
  reducers: { [name: string]: Reducer },
  selectors: {
    getList: Function,
    getObject: Function,
    getLoading: Function,
    getError: Function,
  },
  objectActions: {
    [name: string]: ObjectActionCreator,
  },
  objectSelectors: {
    [name: string]: ObjectSelector,
  },
  wrapEntity: (object: EntityObject) => any,
  form?: any,
};

type Reducer = (state: any, action: any) => any;

export function createEntity(def: EntityDefinition): Entity {
  // $FlowFixMe
  const entity: Entity = { ...def };

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

  // ACTION TYPES
  const CREATE_ACTION = `metabase/entities/${entity.name}/CREATE`;
  const FETCH_ACTION = `metabase/entities/${entity.name}/FETCH`;
  const UPDATE_ACTION = `metabase/entities/${entity.name}/UPDATE`;
  const DELETE_ACTION = `metabase/entities/${entity.name}/DELETE`;
  const FETCH_LIST_ACTION = `metabase/entities/${entity.name}/FETCH_LIST`;

  entity.objectActions = {
    create: createThunkAction(
      CREATE_ACTION,
      entityObject => async (dispatch, getState) => {
        const statePath = ["entities", entity.name, "create"];
        try {
          dispatch(setRequestState({ statePath, state: "LOADING" }));
          const result = normalize(
            await entity.api.create(entityObject),
            entity.schema,
          );
          dispatch(setRequestState({ statePath, state: "LOADED" }));
          return result;
        } catch (error) {
          console.error(`${CREATE_ACTION} failed:`, error);
          dispatch(setRequestState({ statePath, error }));
          throw error;
        }
      },
    ),

    fetch: createThunkAction(
      FETCH_ACTION,
      (entityObject, { reload = false, properties = null } = {}) => (
        dispatch,
        getState,
      ) =>
        fetchData({
          dispatch,
          getState,
          reload,
          properties,
          requestStatePath: getObjectStatePath(entityObject.id),
          existingStatePath: getObjectStatePath(entityObject.id),
          getData: async () =>
            normalize(
              await entity.api.get({ id: entityObject.id }),
              entity.schema,
            ),
        }),
    ),

    update: createThunkAction(
      UPDATE_ACTION,
      (entityObject, updatedObject = null) => async (dispatch, getState) => {
        // If a second object is provided just take the id from the first and
        // update it with all the properties in the second
        // NOTE: this is so that the object.update(updatedObject) method on
        // the default entity wrapper class works correctly
        if (updatedObject) {
          entityObject = { id: entityObject.id, ...updatedObject };
        }
        const statePath = [...getObjectStatePath(entityObject.id), "update"];
        try {
          dispatch(setRequestState({ statePath, state: "LOADING" }));
          const result = normalize(
            await entity.api.update(entityObject),
            entity.schema,
          );
          dispatch(setRequestState({ statePath, state: "LOADED" }));
          return result;
        } catch (error) {
          console.error(`${UPDATE_ACTION} failed:`, error);
          dispatch(setRequestState({ statePath, error }));
          throw error;
        }
      },
    ),

    delete: createThunkAction(
      DELETE_ACTION,
      entityObject => async (dispatch, getState) => {
        const statePath = [...getObjectStatePath(entityObject.id), "delete"];
        try {
          dispatch(setRequestState({ statePath, state: "LOADING" }));
          await entity.api.delete({ id: entityObject.id });
          dispatch(setRequestState({ statePath, state: "LOADED" }));
          return {
            entities: { [entity.name]: { [entityObject.id]: null } },
            result: entityObject.id,
          };
        } catch (error) {
          console.error(`${DELETE_ACTION} failed:`, error);
          dispatch(setRequestState({ statePath, error }));
          throw error;
        }
      },
    ),

    // user defined object actions should override defaults
    ...(def.objectActions || {}),
  };

  // ACTION CREATORS
  entity.actions = {
    fetchList: createThunkAction(
      FETCH_LIST_ACTION,
      (entityQuery = null, { reload = false } = {}) => (dispatch, getState) =>
        fetchData({
          dispatch,
          getState,
          reload,
          requestStatePath: getListStatePath(entityQuery),
          existingStatePath: getListStatePath(entityQuery),
          getData: async () => {
            const { result, entities } = normalize(
              await entity.api.list(entityQuery || {}),
              [entity.schema],
            );
            return { result, entities, entityQuery };
          },
        }),
    ),

    // user defined actions should override defaults
    ...entity.objectActions,
    ...(def.actions || {}),
  };

  // SELECTORS

  const getEntities = state => state.entities;

  // OBJECT SELECTORS

  const getEntityId = (state, props) =>
    (props.params && props.params.entityId) || props.entityId;

  const getObject = createSelector(
    [getEntities, getEntityId],
    (entities, entityId) => denormalize(entityId, entity.schema, entities),
  );

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
    [getEntities, getEntityIds],
    (entities, entityIds) => denormalize(entityIds, [entity.schema], entities),
  );

  // REQUEST STATE SELECTORS

  const getRequestState = (state, props = {}) => {
    const path =
      props.entityId != null
        ? getObjectStatePath(props.entityId)
        : getListStatePath(props.entityQuery);
    return getIn(state, ["requests", "states", ...path, "fetch"]);
  };
  const getLoading = createSelector(
    [getRequestState],
    requestState => (requestState ? requestState.state === "LOADING" : true),
  );
  const getError = createSelector(
    [getRequestState],
    requestState => (requestState ? requestState.error : null),
  );

  entity.selectors = {
    getList,
    getObject,
    getLoading,
    getError,
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
      if (payload.result) {
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
      // $FlowFixMe
      EntityWrapper.prototype[methodName] = function(...args) {
        // $FlowFixMe
        return method(this, ...args);
      };
    }
    // object actions
    for (const [methodName, method] of Object.entries(entity.objectActions)) {
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

    entity.wrapEntity = (object, dispatch) =>
      new EntityWrapper(object, dispatch);
  }

  return entity;
}

type CombinedEntities = {
  entities: { [key: EntityName]: Entity },
  reducers: { [name: string]: Reducer },
  reducer: Reducer,
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

  return {
    entities: entitiesMap,
    reducers: reducersMap,
    reducer: combineReducers(reducersMap),
  };
}
