import { getIn } from "icepick";
import _ from "underscore";

import {
  cardApi,
  dashboardApi,
  databaseApi,
  datasetApi,
  fieldApi,
  segmentApi,
  tableApi,
} from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { isProduction } from "metabase/env";
import { createThunkAction } from "metabase/redux";
import { fetchTableMetadataAndForeignKeys } from "metabase/redux/tables";
import { DatabaseSchema, FieldSchema, TableSchema } from "metabase/schema";
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
  return runRtkEndpoint(undefined, dispatch, segmentApi.endpoints.listSegments);
};

export const updateSegment = (segment) => (dispatch) => {
  deprecated("metabase/redux/metadata updateSegment");
  return runRtkEndpoint(segment, dispatch, segmentApi.endpoints.updateSegment);
};

export const fetchRealDatabases =
  (reload = false) =>
  (dispatch) => {
    deprecated("metabase/redux/metadata fetchRealDatabases");
    return runRtkEndpoint(
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
    return runRtkEndpoint(
      { id: dbId },
      dispatch,
      databaseApi.endpoints.getDatabaseMetadata,
      { forceRefetch: reload },
    );
  };

export const updateDatabase = (database) => async (dispatch) => {
  deprecated("metabase/redux/metadata updateDatabase");
  const slimDatabase = _.omit(database, "tables", "tables_lookup");
  const result = await runRtkEndpoint(
    slimDatabase,
    dispatch,
    databaseApi.endpoints.updateDatabase,
  );
  dispatch(updateMetadata(result, DatabaseSchema));
  return result;
};

export const updateTable = (table) => async (dispatch) => {
  deprecated("metabase/redux/metadata updateTable");
  const slimTable = _.omit(
    table,
    "fields",
    "fields_lookup",
    "aggregation_operators",
    "segments",
  );
  const result = await runRtkEndpoint(
    slimTable,
    dispatch,
    tableApi.endpoints.updateTable,
  );
  dispatch(updateMetadata(result, TableSchema));
  return result;
};

export const fetchTableMetadata = (id, reload = false) => {
  deprecated("metabase/redux/metadata fetchTableMetadata");
  return fetchTableMetadataAndForeignKeys({ id }, { reload });
};

export const updateFieldValues = (fieldId, fieldValuePairs) => (dispatch) => {
  deprecated("metabase/redux/metadata updateFieldValues");
  return runRtkEndpoint(
    { id: fieldId, values: fieldValuePairs },
    dispatch,
    fieldApi.endpoints.updateFieldValues,
  );
};

export const updateField = (field) => async (dispatch) => {
  deprecated("metabase/redux/metadata updateField");
  const slimField = _.omit(field, "filter_operators_lookup");
  const result = await runRtkEndpoint(
    slimField,
    dispatch,
    fieldApi.endpoints.updateField,
  );
  dispatch(updateMetadata(result, FieldSchema));
  return result;
};

export const deleteFieldDimension = (fieldId) => async (dispatch) => {
  deprecated("metabase/redux/metadata deleteFieldDimension");
  const result = await runRtkEndpoint(
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
    const result = await runRtkEndpoint(
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
      if (field != null && field.hasRemappedValue(value)) {
        return;
      }

      if (
        parameter == null ||
        !hasRemappedParameterValues(parameter, field ? [field] : [])
      ) {
        return;
      }

      const entityIdentifier = uuid ?? token ?? null;
      let remapping;
      if (dashboardId != null) {
        remapping = await runRtkEndpoint(
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
      } else if (cardId != null) {
        remapping = await runRtkEndpoint(
          {
            ...(entityIdentifier ? { entityIdentifier } : { card_id: cardId }),
            parameter_id: parameter.id,
            value,
          },
          dispatch,
          cardApi.endpoints.getRemappedCardParameterValue,
          { forceRefetch: false },
        );
      } else if (field != null) {
        // Field-based remapping (e.g. FK display fields). Static-list sources
        // carry their [value, label] pairs inline and need no network call.
        remapping = await runRtkEndpoint(
          {
            parameter: normalizeParameter(parameter),
            field_ids: [field.id],
            value,
          },
          dispatch,
          datasetApi.endpoints.getRemappedParameterValue,
          { forceRefetch: false },
        );
      }

      if (remapping == null) {
        return;
      }

      if (field != null) {
        dispatch(addRemappings(field.id, [remapping]));
      }

      return remapping;
    },
);
