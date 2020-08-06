import { createEntity } from "metabase/lib/entities";
import {
  compose,
  withAction,
  withCachedDataAndRequestState,
  withNormalize,
  handleActions,
  createAction,
  createThunkAction,
  updateData,
} from "metabase/lib/redux";
import { normalize } from "normalizr";
import { assocIn, updateIn } from "icepick";

import { FieldSchema } from "metabase/schema";
import { MetabaseApi } from "metabase/services";

import { getMetadata } from "metabase/selectors/metadata";

import {
  field_visibility_types,
  field_special_types,
  has_field_values_options,
} from "metabase/lib/core";
import { getFieldValues, getRemappings } from "metabase/lib/query/field";
import { TYPE } from "metabase/lib/types";

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

const Fields = createEntity({
  name: "fields",
  path: "/api/field",
  schema: FieldSchema,

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).field(entityId),

    // getMetadata filters out sensitive fields by default.
    // This selector is used in the data model when we want to show them.
    getObjectUnfiltered: (state, { entityId }) => {
      const field = state.entities.fields[entityId];
      return (
        field && {
          ...field,
          values: getFieldValues(field),
          remapping: new Map(getRemappings(field)),
          target: state.entities.fields[field.fk_target_field_id],
        }
      );
    },
  },

  // ACTION CREATORS

  objectActions: {
    fetchFieldValues: compose(
      withAction(FETCH_FIELD_VALUES),
      withCachedDataAndRequestState(
        ({ id }) => [...Fields.getObjectStatePath(id)],
        ({ id }) => [...Fields.getObjectStatePath(id), "values"],
      ),
      withNormalize(FieldSchema),
    )(({ id: fieldId }) => async (dispatch, getState) => {
      const { field_id: id, values } = await MetabaseApi.field_values({
        fieldId,
      });
      return { id, values };
    }),

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
  },

  actions: {
    addParamValues: createAction(ADD_PARAM_VALUES),
    addFields: createAction(ADD_FIELDS, fields =>
      normalize(fields, [FieldSchema]),
    ),
  },

  // ADDITIONAL REDUCER

  reducer: handleActions(
    {
      [ADD_PARAM_VALUES]: {
        next: (state, { payload: paramValues }) => {
          for (const fieldValues of Object.values(paramValues)) {
            state = assocIn(
              state,
              [fieldValues.field_id, "values"],
              fieldValues,
            );
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
  ),

  form: {
    fields: (values = {}) =>
      [
        { name: "display_name" },
        { name: "description" },
        {
          name: "visibility_type",
          type: "select",
          options: field_visibility_types.map(type => ({
            name: type.name,
            value: type.id,
          })),
        },
        {
          name: "special_type",
          type: "select",
          options: field_special_types.map(type => ({
            name: type.name,
            value: type.id,
          })),
        },
        values.special_type === TYPE.FK && {
          name: "fk_target_field_id",
        },
        {
          name: "has_field_values",
          type: "select",
          options: has_field_values_options,
        },
      ].filter(f => f),
  },
});

export default Fields;
