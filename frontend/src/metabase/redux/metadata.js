import { getIn } from "icepick";
import _ from "underscore";

import { cardApi, dashboardApi, datasetApi } from "metabase/api";
import { Databases } from "metabase/entities/databases";
import { Fields } from "metabase/entities/fields";
import { Segments } from "metabase/entities/segments";
import { Tables } from "metabase/entities/tables";
import { isProduction } from "metabase/env";
import { entityCompatibleQuery } from "metabase/lib/entities";
import { createThunkAction, fetchData } from "metabase/lib/redux";
import { RevisionsApi } from "metabase/services";
import { normalizeParameter } from "metabase-lib/v1/parameters/utils/parameter-values";

// NOTE: All of these actions are deprecated. Use metadata entities directly.

const deprecated = (message) => {
  if (!isProduction) {
    console.warn("DEPRECATED: " + message);
  }
};

export const FETCH_SEGMENTS = Segments.actions.fetchList.toString();
export const fetchSegments = (reload = false) => {
  deprecated("metabase/redux/metadata fetchSegments");
  return Segments.actions.fetchList(null, { reload });
};

export const updateSegment = (segment) => {
  deprecated("metabase/redux/metadata updateSegment");
  return Segments.actions.update(segment);
};

export const fetchRealDatabases = (reload = false) => {
  deprecated("metabase/redux/metadata fetchRealDatabases");
  return Databases.actions.fetchList({ include: "tables" }, { reload });
};

export const fetchDatabaseMetadata = (dbId, reload = false) => {
  deprecated("metabase/redux/metadata fetchDatabaseMetadata");
  return Databases.actions.fetchDatabaseMetadata({ id: dbId }, { reload });
};

export const updateDatabase = (database) => {
  deprecated("metabase/redux/metadata updateDatabase");
  const slimDatabase = _.omit(database, "tables", "tables_lookup");
  return Databases.actions.update(slimDatabase);
};

export const updateTable = (table) => {
  deprecated("metabase/redux/metadata updateTable");
  const slimTable = _.omit(
    table,
    "fields",
    "fields_lookup",
    "aggregation_operators",
    "segments",
  );
  return Tables.actions.update(slimTable);
};

export { FETCH_TABLE_METADATA } from "metabase/entities/tables";
export const fetchTableMetadata = (id, reload = false) => {
  deprecated("metabase/redux/metadata fetchTableMetadata");
  return Tables.actions.fetchMetadataAndForeignTables({ id }, { reload });
};

export const METADATA_FETCH_FIELD = "metabase/metadata/FETCH_FIELD";
export const fetchField = createThunkAction(
  METADATA_FETCH_FIELD,
  (id, reload = false) => {
    deprecated("metabase/redux/metadata fetchField");
    return async (dispatch) => {
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

export const updateFieldValues = (fieldId, fieldValuePairs) => {
  deprecated("metabase/redux/metadata updateFieldValues");
  return Fields.actions.updateFieldValues({ id: fieldId }, fieldValuePairs);
};

export { ADD_FIELDS } from "metabase/entities/fields";
export const addFields = (fields) => {
  return Fields.actions.addFields(fields);
};

export const updateField = (field) => {
  deprecated("metabase/redux/metadata updateField");
  const slimField = _.omit(field, "filter_operators_lookup");
  return Fields.actions.update(slimField);
};

export const deleteFieldDimension = (fieldId) => {
  deprecated("metabase/redux/metadata deleteFieldDimension");
  return Fields.actions.deleteFieldDimension({ id: fieldId });
};

export const updateFieldDimension = (fieldId, dimension) => {
  deprecated("metabase/redux/metadata updateFieldDimension");
  return Fields.actions.updateFieldDimension({ id: fieldId }, dimension);
};

export const FETCH_REVISIONS = "metabase/metadata/FETCH_REVISIONS";
export const fetchRevisions = createThunkAction(
  FETCH_REVISIONS,
  (type, id, reload = false) => {
    return async (dispatch, getState) => {
      const requestStatePath = ["revisions", type, id];
      const existingStatePath = ["revisions"];
      const getData = async () => {
        return {
          type,
          id,
          revisions: await RevisionsApi.get({
            id,
            entity: type === "metric" ? "legacy-metric" : type,
          }),
        };
      };

      return await fetchData({
        dispatch,
        getState,
        requestStatePath,
        existingStatePath,
        getData,
        reload,
      });
    };
  },
);

export const FETCH_SEGMENT_FIELDS = "metabase/metadata/FETCH_SEGMENT_FIELDS";
export const fetchSegmentFields = createThunkAction(
  FETCH_SEGMENT_FIELDS,
  (segmentId, reload = false) => {
    return async (dispatch, getState) => {
      await dispatch(fetchSegments()); // FIXME: fetchSegment?
      const segment = getIn(getState(), ["entities", "segments", segmentId]);
      const tableId = segment.table_id;
      await dispatch(fetchTableMetadata(tableId));
      const table = getIn(getState(), ["entities", "tables", tableId]);
      const databaseId = table.db_id;
      await dispatch(fetchDatabaseMetadata(databaseId));
    };
  },
);

export const FETCH_SEGMENT_TABLE = "metabase/metadata/FETCH_SEGMENT_TABLE";
export const fetchSegmentTable = createThunkAction(
  FETCH_SEGMENT_TABLE,
  (segmentId, reload = false) => {
    return async (dispatch, getState) => {
      await dispatch(fetchSegments()); // FIXME: fetchSegment?
      const segment = getIn(getState(), ["entities", "segments", segmentId]);
      const tableId = segment.table_id;
      await dispatch(fetchTableMetadata(tableId));
    };
  },
);

export const FETCH_SEGMENT_REVISIONS =
  "metabase/metadata/FETCH_SEGMENT_REVISIONS";
export const fetchSegmentRevisions = createThunkAction(
  FETCH_SEGMENT_REVISIONS,
  (segmentId, reload = false) => {
    return async (dispatch, getState) => {
      await Promise.all([
        dispatch(fetchRevisions("segment", segmentId)),
        dispatch(fetchSegments()),
      ]);
      const segment = getIn(getState(), ["entities", "segments", segmentId]);
      const tableId = segment.table_id;
      await dispatch(fetchTableMetadata(tableId));
    };
  },
);

export const addRemappings = (fieldId, remappings) => {
  deprecated("metabase/redux/metadata addRemappings");
  return Fields.actions.addRemappings({ id: fieldId }, remappings);
};

const FETCH_REMAPPING = "metabase/metadata/FETCH_REMAPPING";
export const fetchRemapping = createThunkAction(
  FETCH_REMAPPING,
  ({ parameter, value, field, cardId, dashboardId, uuid, token }) =>
    async (dispatch, getState) => {
      if (
        field == null ||
        field.remappedField() == null ||
        field.hasRemappedValue(value)
      ) {
        return;
      }

      const entityIdentifier = uuid ?? token ?? null;

      if (dashboardId != null && parameter != null) {
        const remapping = await entityCompatibleQuery(
          {
            ...(entityIdentifier
              ? { entityIdentifier }
              : { dashboard_id: dashboardId }),
            parameter_id: parameter.id,
            value,
          },
          dispatch,
          dashboardApi.endpoints.getRemappedDashboardParameterValue,
          { forceRefetch: false },
        );
        if (remapping != null) {
          dispatch(addRemappings(field.id, [remapping]));
        }
      } else if (cardId != null && parameter != null) {
        const remapping = await entityCompatibleQuery(
          {
            ...(entityIdentifier ? { entityIdentifier } : { card_id: cardId }),
            parameter_id: parameter.id,
            value,
          },
          dispatch,
          cardApi.endpoints.getRemappedCardParameterValue,
          { forceRefetch: false },
        );
        if (remapping != null) {
          dispatch(addRemappings(field.id, [remapping]));
        }
      } else if (parameter != null) {
        const remapping = await entityCompatibleQuery(
          {
            parameter: normalizeParameter(parameter),
            field_ids: [field.id],
            value,
          },
          dispatch,
          datasetApi.endpoints.getRemappedParameterValue,
          { forceRefetch: false },
        );
        if (remapping != null) {
          dispatch(addRemappings(field.id, [remapping]));
        }
      }
    },
);
