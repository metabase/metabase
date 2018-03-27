import {
  combineReducers,
  createThunkAction,
  fetchData,
  handleEntities,
} from "metabase/lib/redux";

import api from "metabase/lib/api";
const { GET, PUT, POST, DELETE } = api;

import { createSelector } from "reselect";
import { normalize, schema } from "normalizr";

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
const req = require.context("metabase/redux/entities", true, /.*.js$/);
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
  if (!entity.api) {
    entity.api = {
      list: GET(`${entity.path}`),
      create: POST(`${entity.path}`),
      get: GET(`${entity.path}/:id`),
      update: PUT(`${entity.path}/:id`),
      delete: DELETE(`${entity.path}/:id`),
    };
  }

  // ACITONS
  const LIST_ACTION = `metabase/entities/${entity.name}/LIST`;
  const GET_ACTION = `metabase/entities/${entity.name}/GET`;
  if (!entity.actions) {
    entity.actions = {};
    entity.actions.list = createThunkAction(
      LIST_ACTION,
      (reload = false) => (dispatch, getState) =>
        fetchData({
          dispatch,
          getState,
          reload,
          requestStatePath: ["entities", entity.name],
          existingStatePath: ["entities", entity.name + "_list"],
          getData: async () =>
            normalize(await entity.api.list(), [entity.schema]),
        }),
    );
    entity.actions.get = createThunkAction(
      GET_ACTION,
      (id, reload = false) => (dispatch, getState) =>
        fetchData({
          dispatch,
          getState,
          reload,
          requestStatePath: ["entities", entity.name, id],
          existingStatePath: ["entities", entity.name, id],
          getData: async () =>
            normalize(await entity.api.get({ id }), entity.schema),
        }),
    );
  }

  // SELECTORS
  const getEntities = state => state.entities[entity.name];
  const getEntitiesIdsList = state => state.entities[`${entity.name}_list`];
  const getEntityId = (state, props) => props.params.entityId;
  const getList = createSelector(
    [getEntities, getEntitiesIdsList],
    (entities, entityIds) => entityIds && entityIds.map(id => entities[id]),
  );
  const getObject = createSelector(
    [getEntities, getEntityId],
    (entities, entityId) => entities[entityId],
  );
  entity.selectors = {
    getEntities,
    getEntitiesIdsList,
    getList,
    getObject,
  };

  // REDUCER
  reducers[entity.name] = handleEntities(/^metabase\/entities\//, entity.name);
  reducers[entity.name + "_list"] = (state = null, action) => {
    if (action.type === LIST_ACTION) {
      return action.payload.result;
    } else {
      return state;
    }
  };
}

window.Metabase = window.Metabase || {};
window.Metabase.entities = entities;

export default combineReducers(reducers);
