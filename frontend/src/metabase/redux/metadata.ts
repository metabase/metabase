import { type Schema, normalize } from "normalizr";
import _ from "underscore";

import { databaseApi, fieldApi, segmentApi, tableApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { createThunkAction } from "metabase/redux";
import { fetchRevisions } from "metabase/redux/revisions";
import type { Dispatch } from "metabase/redux/store";
import { fetchTableMetadataAndForeignKeys } from "metabase/redux/tables";
import { DatabaseSchema, FieldSchema, TableSchema } from "metabase/schema";
import type {
  Database,
  DatabaseId,
  Field,
  Segment,
  SegmentId,
  Table,
} from "metabase-types/api";

const UPDATE = "metabase/entities/UPDATE";

// Normalizes an entity (or list) and dispatches it into `state.entities`.
// Handled by the per-slice reducers in `metabase/redux/entities` — see
// `makeSliceReducer` there, which merges `payload.entities.<name>` into the
// matching `state.entities.<name>` slice so `getMetadata` picks up the change.
export function updateMetadata(data: unknown, schema: Schema) {
  const payload = normalize(data, schema);
  return { type: UPDATE, payload };
}

export const fetchSegments =
  () =>
  (dispatch: Dispatch): Promise<unknown> =>
    runRtkEndpoint(undefined, dispatch, segmentApi.endpoints.listSegments);

export const updateSegment =
  (segment: Segment) =>
  (dispatch: Dispatch): Promise<unknown> =>
    runRtkEndpoint(segment, dispatch, segmentApi.endpoints.updateSegment);

export const fetchRealDatabases =
  (reload = false) =>
  (dispatch: Dispatch): Promise<unknown> =>
    runRtkEndpoint(
      { include: "tables" },
      dispatch,
      databaseApi.endpoints.listDatabases,
      { forceRefetch: reload },
    );

export const fetchDatabaseMetadata =
  (id: DatabaseId, options: { reload?: boolean } = {}) =>
  (dispatch: Dispatch): Promise<unknown> =>
    runRtkEndpoint(
      { id },
      dispatch,
      databaseApi.endpoints.getDatabaseMetadata,
      { forceRefetch: options.reload ?? false },
    );

export const updateDatabase =
  (database: Database) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const slimDatabase = _.omit(database, "tables", "tables_lookup");
    const result: unknown = await runRtkEndpoint(
      slimDatabase,
      dispatch,
      databaseApi.endpoints.updateDatabase,
    );
    dispatch(updateMetadata(result, DatabaseSchema));
    return result;
  };

export const updateTable =
  (table: Table) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const slimTable = _.omit(
      table,
      "fields",
      "fields_lookup",
      "aggregation_operators",
      "segments",
    );
    const result: unknown = await runRtkEndpoint(
      slimTable,
      dispatch,
      tableApi.endpoints.updateTable,
    );
    dispatch(updateMetadata(result, TableSchema));
    return result;
  };

export const updateField =
  (field: Field) =>
  async (dispatch: Dispatch): Promise<unknown> => {
    const slimField = _.omit(field, "filter_operators_lookup");
    const result: unknown = await runRtkEndpoint(
      slimField,
      dispatch,
      fieldApi.endpoints.updateField,
    );
    dispatch(updateMetadata(result, FieldSchema));
    return result;
  };

const FETCH_SEGMENT_FIELDS = "metabase/metadata/FETCH_SEGMENT_FIELDS";
export const fetchSegmentFields = createThunkAction(
  FETCH_SEGMENT_FIELDS,
  (segmentId: SegmentId) => {
    return async (dispatch, getState) => {
      await dispatch(fetchSegments());
      const tableId = getState().entities.segments[segmentId].table_id;
      await dispatch(fetchTableMetadataAndForeignKeys({ id: tableId }));
      const databaseId = getState().entities.tables[tableId].db_id;
      await dispatch(fetchDatabaseMetadata(databaseId));
    };
  },
);

const FETCH_SEGMENT_TABLE = "metabase/metadata/FETCH_SEGMENT_TABLE";
export const fetchSegmentTable = createThunkAction(
  FETCH_SEGMENT_TABLE,
  (segmentId: SegmentId) => {
    return async (dispatch, getState) => {
      await dispatch(fetchSegments());
      const tableId = getState().entities.segments[segmentId].table_id;
      await dispatch(fetchTableMetadataAndForeignKeys({ id: tableId }));
    };
  },
);

const FETCH_SEGMENT_REVISIONS = "metabase/metadata/FETCH_SEGMENT_REVISIONS";
export const fetchSegmentRevisions = createThunkAction(
  FETCH_SEGMENT_REVISIONS,
  (segmentId: SegmentId) => {
    return async (dispatch, getState) => {
      await Promise.all([
        dispatch(fetchRevisions("segment", segmentId)),
        dispatch(fetchSegments()),
      ]);
      const tableId = getState().entities.segments[segmentId].table_id;
      await dispatch(fetchTableMetadataAndForeignKeys({ id: tableId }));
    };
  },
);
