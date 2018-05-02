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
import { normalize, schema } from "normalizr";
import { getIn } from "icepick";

// entity defintions export the following properties (`name`, and `api` or `path` are required)
//
// name: plural, like "questions" or "dashboards"
// api: object containing `list`, `create`, `get`, `update`, `delete` methods (OR see `path` below)
// path: API endpoint to create default `api` object
// schema: normalizr schema, defaults to `new schema.Entity(entity.name)`
// getName: property to show as the name, defaults to `name`
//

import type { APIMethod } from "metabase/lib/api";

type EntityName = string;

type EntityDefinition = {
  name: EntityName,
  path: string,
  api?: { [method: string]: APIMethod },
  schema?: schema.Entity,
  actions?: { [name: string]: any },
  reducer?: Reducer,
  objectActions?: { [name: string]: any },
};

export type Entity = {
  name: EntityName,
  api: {
    list: APIMethod,
    create: APIMethod,
    get: APIMethod,
    update: APIMethod,
    delete: APIMethod,
  },
  schema: schema.Entity,
  actions: { [name: string]: any },
  reducers: { [name: string]: Reducer },
  selectors: {
    getEntities: any,
    getEntitiesIdsList: any,
    getList: any,
    getObject: any,
    getLoading: any,
    getError: any,
  },
  getName: (object: any) => string,
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
  if (!entity.getName) {
    entity.getName = object => object.name;
  }

  // API
  if (!entity.api) {
    entity.api = {
      list: GET(`${entity.path}`),
      create: POST(`${entity.path}`),
      get: GET(`${entity.path}/:id`),
      update: PUT(`${entity.path}/:id`),
      delete: DELETE(`${entity.path}/:id`),
    };
  }

  // ACITON TYPES
  const CREATE_ACTION = `metabase/entities/${entity.name}/CREATE`;
  const FETCH_ACTION = `metabase/entities/${entity.name}/FETCH`;
  const UPDATE_ACTION = `metabase/entities/${entity.name}/UPDATE`;
  const DELETE_ACTION = `metabase/entities/${entity.name}/DELETE`;
  const FETCH_LIST_ACTION = `metabase/entities/${entity.name}/FETCH_LIST`;

  // ACTION CREATORS
  entity.actions = {
    ...(def.actions || {}),
    ...(def.objectActions || {}),

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
      (entityObject, reload = false) => (dispatch, getState) =>
        fetchData({
          dispatch,
          getState,
          reload,
          requestStatePath: ["entities", entity.name, entityObject.id],
          existingStatePath: ["entities", entity.name, entityObject.id],
          getData: async () =>
            normalize(
              await entity.api.get({ id: entityObject.id }),
              entity.schema,
            ),
        }),
    ),

    update: createThunkAction(
      UPDATE_ACTION,
      entityObject => async (dispatch, getState) => {
        const statePath = ["entities", entity.name, entityObject.id, "update"];
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
        const statePath = ["entities", entity.name, entityObject.id, "delete"];
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

    fetchList: createThunkAction(
      FETCH_LIST_ACTION,
      // (query = {}, reload = false) => async (dispatch, getState) => {
      //   const statePath = ["entities", entity.name + "_list", "fetch"];
      //   try {
      //     dispatch(setRequestState({ statePath, state: "LOADING" }));
      //     const result = normalize(await entity.api.list(query), [
      //       entity.schema,
      //     ]);
      //     setTimeout(
      //       () => dispatch(setRequestState({ statePath, state: "LOADED" })),
      //       10,
      //     );
      //     return result;
      //   } catch (error) {
      //     console.error(`${FETCH_LIST_ACTION} failed:`, error);
      //     dispatch(setRequestState({ statePath, error }));
      //     throw error;
      //   }
      // },
      (query = {}, reload = false) => (dispatch, getState) =>
        fetchData({
          dispatch,
          getState,
          reload,
          requestStatePath: ["entities", entity.name + "_list"], // FIXME: different path depending on query?
          existingStatePath: ["entities", entity.name + "_list"], // FIXME: different path depending on query?
          getData: async () =>
            normalize(await entity.api.list(query), [entity.schema]),
        }),
    ),
  };

  // SELECTORS
  const getEntities = state => state.entities[entity.name];
  const getEntitiesIdsList = state => state.entities[`${entity.name}_list`];
  const getEntityId = (state, props) =>
    (props.params && props.params.entityId) || props.entityId;
  const getList = createSelector(
    [getEntities, getEntitiesIdsList],
    (entities, entityIds) => entityIds && entityIds.map(id => entities[id]),
  );
  const getObject = createSelector(
    [getEntities, getEntityId],
    (entities, entityId) => entities[entityId],
  );

  const getRequestState = (state, props = {}) => {
    const path = ["requests", "states", "entities"];
    if (props.entityId != null) {
      path.push(entity.name, props.entityId);
    } else {
      path.push(entity.name + "_list");
    }
    path.push(props.requestType || "fetch");
    return getIn(state, path);
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
    getEntities,
    getEntitiesIdsList,
    getList,
    getObject,
    getLoading,
    getError,
  };

  // REDUCERS

  entity.reducers = {};

  entity.reducers[entity.name] = handleEntities(
    /^metabase\/entities\//,
    entity.name,
    def.reducer,
  );

  entity.reducers[entity.name + "_list"] = (state = null, action) => {
    if (action.error) {
      return state;
    }
    if (action.type === FETCH_LIST_ACTION) {
      return action.payload.result || state;
    } else if (action.type === CREATE_ACTION) {
      return state && state.concat([action.payload.result]);
    } else if (action.type === DELETE_ACTION) {
      return state && state.filter(id => id !== action.payload.result);
    } else {
      return state;
    }
  };

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
