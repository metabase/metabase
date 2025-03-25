import _ from "underscore";

import Fields from "metabase/entities/fields";
import { isProduction } from "metabase/env";
import { createThunkAction, fetchData } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { MetabaseApi } from "metabase/services";

// NOTE: All of these actions are deprecated. Use metadata entities directly.

const deprecated = message => {
  if (!isProduction) {
    console.warn("DEPRECATED: " + message);
  }
};

export const METADATA_FETCH_FIELD = "metabase/metadata/FETCH_FIELD";
export const fetchField = createThunkAction(
  METADATA_FETCH_FIELD,
  (id, reload = false) => {
    deprecated("metabase/redux/metadata fetchField");
    return async dispatch => {
      const action = await dispatch(Fields.actions.fetch({ id }, { reload }));
      const field = Fields.HACK_getObjectFromAction(action);
      if (field?.dimensions?.[0]?.human_readable_field_id != null) {
        await dispatch(
          Fields.actions.fetch(
            { id: field.dimensions?.[0]?.human_readable_field_id },
            { reload },
          ),
        );
      }
    };
  },
);

export { ADD_PARAM_VALUES } from "metabase/entities/fields";
export const addParamValues = paramValues => {
  deprecated("metabase/redux/metadata addParamValues");
  return Fields.actions.addParamValues(paramValues);
};

export { ADD_FIELDS } from "metabase/entities/fields";
export const addFields = fieldMaps => {
  deprecated("metabase/redux/metadata addFields");
  return Fields.actions.addFields(fieldMaps);
};

export const updateField = field => {
  deprecated("metabase/redux/metadata updateField");
  const slimField = _.omit(field, "filter_operators_lookup");
  return Fields.actions.update(slimField);
};

export const updateFieldDimension = (fieldId, dimension) => {
  deprecated("metabase/redux/metadata updateFieldDimension");
  return Fields.actions.updateFieldDimension({ id: fieldId }, dimension);
};

export const addRemappings = (fieldId, remappings) => {
  deprecated("metabase/redux/metadata addRemappings");
  return Fields.actions.addRemappings({ id: fieldId }, remappings);
};

const FETCH_REMAPPING = "metabase/metadata/FETCH_REMAPPING";
export const fetchRemapping = createThunkAction(
  FETCH_REMAPPING,
  (value, fieldId) => async (dispatch, getState) => {
    const metadata = getMetadata(getState());
    const field = metadata.field(fieldId);
    const remappedField = field && field.remappedField();
    if (field && remappedField && !field.hasRemappedValue(value)) {
      const fieldId = (field.target || field).id;
      const remappedFieldId = remappedField.id;
      fetchData({
        dispatch,
        getState,
        requestStatePath: [
          "entities",
          "remapping",
          fieldId,
          JSON.stringify(value),
        ],
        getData: async () => {
          const remapping = await MetabaseApi.field_remapping({
            value,
            fieldId,
            remappedFieldId,
          });
          if (remapping) {
            // FIXME: should this be field.id (potentially the FK) or fieldId (always the PK)?
            dispatch(addRemappings(field.id, [remapping]));
          }
        },
      });
    }
  },
);
