import {
  combineReducers,
  createThunkAction,
  fetchData,
  updateData,
  handleEntities,
} from "metabase/lib/redux";
import { setRequestState, clearRequestState } from "metabase/redux/requests";

import api from "metabase/lib/api";
const { GET, PUT, POST, DELETE } = api;

import { createSelector } from "reselect";
import { normalize, schema } from "normalizr";
import { getIn } from "icepick";

export const entities = {};
export const reducers = {};

// entity defintions export the following properties (`name`, and `api` or `path` are required)
//
// name: plural, like "questions" or "dashboards"
// schema: normalizr schema, defaults to `new schema.Entity(entity.name)`
// nameProperty: property to show as the name, defaults to `name`
// api: object containing `list`, `create`, `get`, `update`, `delete` methods (OR see `path` below)
// path: API endpoint to create default `api` object
//

// $FlowFixMe: doesn't know about require.context
const req = require.context("metabase/entities/entities", true, /.*.js$/);
const entityDefs = req.keys().map(key => req(key));
for (const def of entityDefs) {
  const entity = (entities[def.name] = { ...def });

  // defaults
  if (!entity.schema) {
    entity.schema = new schema.Entity(entity.name);
  }
  if (!entity.nameProperty) {
    entity.nameProperty = "name";
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
    create: createThunkAction(
      CREATE_ACTION,
      entityObject => async (dispatch, getState) => {
        const statePath = ["entities", entities.name, "create"];
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
        const statePath = [
          "entities",
          entities.name,
          entityObject.id,
          "update",
        ];
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
        const statePath = [
          "entities",
          entities.name,
          entityObject.id,
          "delete",
        ];
        try {
          dispatch(setRequestState({ statePath, state: "LOADING" }));
          await entity.api.delete({ id: entityObject.id });
          dispatch(setRequestState({ statePath, state: "LOADED" }));
          return {
            entities: { [entities.name]: { [entityObject.id]: null } },
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
      (reload = false) => (dispatch, getState) =>
        fetchData({
          dispatch,
          getState,
          reload,
          requestStatePath: ["entities", entity.name + "_list"],
          existingStatePath: ["entities", entity.name + "_list"],
          getData: async () =>
            normalize(await entity.api.list(), [entity.schema]),
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

  const getRequestState = (state, props) => {
    const path = ["requests", "states", "entities", entity.name];
    if (props.entityId != null) {
      path.push(props.entityId);
    }
    path.push(props.requestType || "fetch");
    return getIn(state, path);
  };
  const getLoading = createSelector(
    [getRequestState],
    requestState => requestState && requestState.state === "LOADING",
  );
  const getError = createSelector(
    [getRequestState],
    requestState => requestState && requestState.error,
  );

  entity.selectors = {
    getEntities,
    getEntitiesIdsList,
    getList,
    getObject,
    getLoading,
    getError,
  };

  // REDUCER
  reducers[entity.name] = handleEntities(/^metabase\/entities\//, entity.name);
  reducers[entity.name + "_list"] = (state = null, action) => {
    if (action.error) {
      return state;
    }
    if (action.type === FETCH_LIST_ACTION) {
      return action.payload.result;
    } else if (action.type === CREATE_ACTION) {
      return state && state.concat([action.payload.result]);
    } else if (action.type === DELETE_ACTION) {
      return state && state.filter(id => id !== action.payload.result);
    } else {
      return state;
    }
  };
}

window.Metabase = window.Metabase || {};
window.Metabase.entities = entities;

export default combineReducers(reducers);
