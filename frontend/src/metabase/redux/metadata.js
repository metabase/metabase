import { getIn } from "icepick";
import _ from "underscore";

import {
  cardApi,
  dashboardApi,
  databaseApi,
  datasetApi,
  fieldApi,
  segmentApi,
} from "metabase/api";
import { Tables } from "metabase/entities/tables";
import { entityCompatibleQuery } from "metabase/entities/utils";
import { isProduction } from "metabase/env";
import { createThunkAction } from "metabase/redux";
import { DatabaseSchema, FieldSchema } from "metabase/schema";
import { RevisionsApi } from "metabase/services";
import { hasRemappedParameterValues } from "metabase-lib/v1/parameters/utils/parameter-source";
import { normalizeParameter } from "metabase-lib/v1/parameters/utils/parameter-values";

import { updateMetadata } from "./metadata-typed";

export * from "metabase/redux/metadata-typed";

// NOTE: All of these actions are deprecated. Use metadata entities directly.

const deprecated = (message) => {
  if (!isProduction) {
    console.warn("DEPRECATED: " + message);
  }
};

export const fetchSegments = () => (dispatch) => {
  deprecated("metabase/redux/metadata fetchSegments");
  return entityCompatibleQuery(
    undefined,
    dispatch,
    segmentApi.endpoints.listSegments,
  );
};

export const updateSegment = (segment) => (dispatch) => {
  deprecated("metabase/redux/metadata updateSegment");
  return entityCompatibleQuery(
    segment,
    dispatch,
    segmentApi.endpoints.updateSegment,
  );
};

export const fetchRealDatabases =
  (reload = false) =>
  (dispatch) => {
    deprecated("metabase/redux/metadata fetchRealDatabases");
    return entityCompatibleQuery(
      { include: "tables" },
      dispatch,
      databaseApi.endpoints.listDatabases,
      { forceRefetch: reload },
    );
  };

export const fetchDatabaseMetadata =
  (dbId, reload = false) =>
  (dispatch) => {
    deprecated("metabase/redux/metadata fetchDatabaseMetadata");
    return entityCompatibleQuery(
      { id: dbId },
      dispatch,
      databaseApi.endpoints.getDatabaseMetadata,
      { forceRefetch: reload },
    );
  };

export const updateDatabase = (database) => async (dispatch) => {
  deprecated("metabase/redux/metadata updateDatabase");
  const slimDatabase = _.omit(database, "tables", "tables_lookup");
  const result = await entityCompatibleQuery(
    slimDatabase,
    dispatch,
    databaseApi.endpoints.updateDatabase,
  );
  dispatch(updateMetadata(result, DatabaseSchema));
  return result;
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

export const updateFieldValues = (fieldId, fieldValuePairs) => (dispatch) => {
  deprecated("metabase/redux/metadata updateFieldValues");
  return entityCompatibleQuery(
    { id: fieldId, values: fieldValuePairs },
    dispatch,
    fieldApi.endpoints.updateFieldValues,
  );
};

export const updateField = (field) => async (dispatch) => {
  deprecated("metabase/redux/metadata updateField");
  const slimField = _.omit(field, "filter_operators_lookup");
  const result = await entityCompatibleQuery(
    slimField,
    dispatch,
    fieldApi.endpoints.updateField,
  );
  dispatch(updateMetadata(result, FieldSchema));
  return result;
};

export const deleteFieldDimension = (fieldId) => async (dispatch) => {
  deprecated("metabase/redux/metadata deleteFieldDimension");
  const result = await entityCompatibleQuery(
    fieldId,
    dispatch,
    fieldApi.endpoints.deleteFieldDimension,
  );
  dispatch(updateMetadata({ id: fieldId, dimensions: [] }, FieldSchema));
  return result;
};

export const updateFieldDimension =
  (fieldId, dimension) => async (dispatch) => {
    deprecated("metabase/redux/metadata updateFieldDimension");
    const result = await entityCompatibleQuery(
      { id: fieldId, ...dimension },
      dispatch,
      fieldApi.endpoints.createFieldDimension,
    );
    dispatch(
      updateMetadata({ id: fieldId, dimensions: [result] }, FieldSchema),
    );
    return result;
  };

export const FETCH_REVISIONS = "metabase/metadata/FETCH_REVISIONS";
export const fetchRevisions = createThunkAction(FETCH_REVISIONS, (type, id) => {
  return async () => {
    const revisions = await RevisionsApi.get({
      id,
      entity: type === "metric" ? "legacy-metric" : type,
    });
    return { type, id, revisions };
  };
});

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

export const addRemappings = (fieldId, remappings) => (dispatch, getState) => {
  deprecated("metabase/redux/metadata addRemappings");
  const existing = getState().entities.fields?.[fieldId]?.remappings ?? [];
  const merged = Array.from(new Map(existing.concat(remappings)));
  return dispatch(
    updateMetadata({ id: fieldId, remappings: merged }, FieldSchema),
  );
};

const FETCH_REMAPPING = "metabase/metadata/FETCH_REMAPPING";
export const fetchRemapping = createThunkAction(
  FETCH_REMAPPING,
  ({ parameter, value, field, cardId, dashboardId, uuid, token }) =>
    async (dispatch, getState) => {
      if (
        field == null ||
        !hasRemappedParameterValues(parameter, [field]) ||
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
