import { t } from "ttag";
import { normalize } from "normalizr";
import { assocIn, updateIn } from "icepick";
import { createEntity, notify } from "metabase/lib/entities";
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

import { FieldSchema } from "metabase/schema";
import { MetabaseApi } from "metabase/services";

import {
  getMetadata,
  getMetadataUnfiltered,
} from "metabase/selectors/metadata";

import { UPDATE_TABLE_FIELD_ORDER } from "metabase/entities/tables";

import {
  field_visibility_types,
  field_semantic_types,
  has_field_values_options,
} from "metabase/lib/core";
import { TYPE } from "metabase-lib/types/constants";
import { getFieldValues } from "metabase-lib/queries/utils/field";

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
    getObjectUnfiltered: (state, { entityId }) =>
      getMetadataUnfiltered(state).field(entityId),
    getFieldValues: (state, { entityId }) => {
      const field = state.entities.fields[entityId];
      return field ? getFieldValues(field) : [];
    },
  },

  // ACTION CREATORS

  objectActions: {
    fetchFieldValues: compose(
      withAction(FETCH_FIELD_VALUES),
      withCachedDataAndRequestState(
        ({ id }) => [...Fields.getObjectStatePath(id)],
        ({ id }) => [...Fields.getObjectStatePath(id), "values"],
        entityQuery => Fields.getQueryKey(entityQuery),
      ),
      withNormalize(FieldSchema),
    )(({ id: fieldId, ...params }) => async (dispatch, getState) => {
      const {
        field_id: id,
        values,
        has_more_values,
      } = await MetabaseApi.field_values({
        fieldId,
        ...params,
      });
      return { id, values, has_more_values };
    }),

    updateField(field, values, opts) {
      return async (dispatch, getState) => {
        const result = await dispatch(
          Fields.actions.update(
            { id: field.id },
            values,
            notify(opts, field.displayName(), t`updated`),
          ),
        );

        // field values needs to be fetched again once the field is updated metabase#16322
        await dispatch(
          Fields.actions.fetchFieldValues({ id: field.id }, { reload: true }),
        );

        return result;
      };
    },
    // Docstring from m.api.field:
    // Update the human-readable values for a `Field` whose semantic type is
    // `category`/`city`/`state`/`country` or whose base type is `type/Boolean`."
    updateFieldValues: createThunkAction(
      UPDATE_FIELD_VALUES,
      ({ id }, fieldValuePairs) =>
        (dispatch, getState) =>
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
      ({ id }, dimension) =>
        () => {
          return MetabaseApi.field_dimension_update({
            fieldId: id,
            ...dimension,
          });
        },
    ),
    deleteFieldDimension: createThunkAction(
      DELETE_FIELD_DIMENSION,
      ({ id }) =>
        async () => {
          await MetabaseApi.field_dimension_delete({ fieldId: id });
          return { id };
        },
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
      [UPDATE_TABLE_FIELD_ORDER]: (state, { payload: { fieldOrder } }) => {
        fieldOrder.forEach((fieldId, index) => {
          state = assocIn(state, [fieldId, "position"], index);
        });

        return state;
      },
      [UPDATE_FIELD_DIMENSION]: (state, { payload: dimension }) =>
        assocIn(state, [dimension.field_id, "dimensions"], [dimension]),
      [DELETE_FIELD_DIMENSION]: (state, { payload: { id } }) =>
        assocIn(state, [id, "dimensions"], []),
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
          name: "semantic_type",
          type: "select",
          options: field_semantic_types.map(type => ({
            name: type.name,
            value: type.id,
          })),
        },
        values.semantic_type === TYPE.FK && {
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
