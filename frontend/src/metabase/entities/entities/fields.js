import { FieldSchema } from "metabase/schema";
import { MetabaseApi } from "metabase/services";

import {
  handleActions,
  createAction,
  createThunkAction,
  fetchData,
  updateData,
} from "metabase/lib/redux";
import { normalize } from "normalizr";
import { assocIn, updateIn } from "icepick";

// ENTITY DEFINITION

export const name = "fields";
export const path = "/api/field";
export const schema = FieldSchema;

// ADDITIONAL OBJECT ACTIONS

export const FETCH_FIELD_VALUES = "metabase/entities/fields/FETCH_FIELD_VALUES";
export const UPDATE_FIELD_VALUES =
  "metabase/entities/fields/UPDATE_FIELD_VALUES";
export const DELETE_FIELD_DIMENSION =
  "metabase/metadata/DELETE_FIELD_DIMENSION";
export const UPDATE_FIELD_DIMENSION =
  "metabase/metadata/UPDATE_FIELD_DIMENSION";
export const ADD_REMAPPINGS = "metabase/entities/fields/ADD_REMAPPINGS";

// ADDITIONAL OTHER ACTIONS

export const ADD_PARAM_VALUES = "metabase/entities/fields/ADD_PARAM_VALUES";
export const ADD_FIELDS = "metabase/entities/fields/ADD_FIELDS";

// ACTION CREATORS

export const objectActions = {
  fetchFieldValues: createThunkAction(
    FETCH_FIELD_VALUES,
    ({ id }, reload) => (dispatch, getState) =>
      fetchData({
        dispatch,
        getState,
        requestStatePath: ["entities", "fields", id, "values"],
        existingStatePath: ["entities", "fields", id, "values"],
        getData: () => MetabaseApi.field_values({ fieldId: id }),
        reload,
      }),
  ),

  // Docstring from m.api.field:
  // Update the human-readable values for a `Field` whose special type is
  // `category`/`city`/`state`/`country` or whose base type is `type/Boolean`."
  updateFieldValues: createThunkAction(
    UPDATE_FIELD_VALUES,
    ({ id }, fieldValuePairs) => (dispatch, getState) =>
      updateData({
        dispatch,
        getState,
        requestStatePath: ["entities", "fields", id, "dimension"],
        existingStatePath: ["entities", "fields", id],
        putData: () =>
          MetabaseApi.field_values_update({
            fieldId: id,
            values: fieldValuePairs,
          }),
      }),
  ),
  updateFieldDimension: createThunkAction(
    UPDATE_FIELD_DIMENSION,
    ({ id }, dimension) => (dispatch, getState) =>
      updateData({
        dispatch,
        getState,
        requestStatePath: ["entities", "fields", id, "dimension"],
        existingStatePath: ["entities", "fields", id],
        putData: () =>
          MetabaseApi.field_dimension_update({
            fieldId: id,
            ...dimension,
          }),
      }),
  ),
  deleteFieldDimension: createThunkAction(
    DELETE_FIELD_DIMENSION,
    ({ id }) => (dispatch, getState) =>
      updateData({
        dispatch,
        getState,
        requestStatePath: ["entities", "fields", id, "dimension"],
        existingStatePath: ["entities", "fields", id],
        putData: () => MetabaseApi.field_dimension_delete({ fieldId: id }),
      }),
  ),

  addRemappings: createAction(ADD_REMAPPINGS, ({ id }, remappings) => ({
    fieldId: id,
    remappings,
  })),
};

export const actions = {
  addParamValues: createAction(ADD_PARAM_VALUES),
  addFields: createAction(ADD_FIELDS, fields =>
    normalize(fields, [FieldSchema]),
  ),
};

// ADDITIONAL REDUCER

export const reducer = handleActions(
  {
    [FETCH_FIELD_VALUES]: {
      next: (state, { payload: fieldValues }) =>
        fieldValues
          ? assocIn(state, [fieldValues.field_id, "values"], fieldValues.values)
          : state,
    },
    [ADD_PARAM_VALUES]: {
      next: (state, { payload: paramValues }) => {
        for (const fieldValues of Object.values(paramValues)) {
          state = assocIn(state, [fieldValues.field_id, "values"], fieldValues);
        }
        return state;
      },
    },
    [ADD_REMAPPINGS]: (state, { payload: { fieldId, remappings } }) =>
      updateIn(state, [fieldId, "remappings"], (existing = []) =>
        Array.from(new Map(existing.concat(remappings))),
      ),
  },
  {},
);
