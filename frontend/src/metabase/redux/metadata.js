import _ from "underscore";
import { createThunkAction, fetchData } from "metabase/lib/redux";

import { getMetadata } from "metabase/selectors/metadata";

import { MetabaseApi } from "metabase/services";

import Databases from "metabase/entities/databases";
import Schemas from "metabase/entities/schemas";
import Tables from "metabase/entities/tables";
import Fields from "metabase/entities/fields";

// NOTE: All of these actions are deprecated. Use metadata entities directly.

const deprecated = message => console.warn("DEPRECATED: " + message);

export const fetchDatabaseMetadata = (dbId, reload = false) => {
  deprecated("metabase/redux/metadata fetchDatabaseMetadata");
  return Databases.actions.fetchDatabaseMetadata({ id: dbId }, { reload });
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

export const fetchFieldValues = (id, reload = false) => {
  deprecated("metabase/redux/metadata fetchFieldValues");
  return Fields.actions.fetchFieldValues({ id }, reload);
};

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

export const FETCH_REVISIONS = "metabase/metadata/FETCH_REVISIONS";

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

export const loadMetadataForQuery = (query, extraDependencies) =>
  loadMetadataForQueries([query], extraDependencies);

export const loadMetadataForQueries =
  (queries, extraDependencies, options) => dispatch => {
    const dependencies = _.chain(queries)
      .map(q => q.dependentMetadata())
      .push(...(extraDependencies ?? []))
      .flatten()
      .uniq(false, dep => dep.type + dep.id)
      .map(({ type, id, foreignTables }) => {
        if (type === "table") {
          return (
            foreignTables
              ? Tables.actions.fetchMetadataAndForeignTables
              : Tables.actions.fetchMetadata
          )({ id }, options);
        } else if (type === "field") {
          return Fields.actions.fetch({ id }, options);
        } else if (type === "schema") {
          return Schemas.actions.fetchList({ dbId: id }, options);
        } else {
          console.warn(`loadMetadataForQueries: type ${type} not implemented`);
        }
      })
      .filter(Boolean)
      .value();

    return Promise.all(dependencies.map(dispatch)).catch(e =>
      console.error("Failed loading metadata for query", e),
    );
  };
