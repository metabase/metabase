import { type Schema, normalize } from "normalizr";
import _ from "underscore";

import { databaseApi, fieldApi, segmentApi, tableApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { createThunkAction } from "metabase/redux";
import { fetchRevisions } from "metabase/redux/revisions";
import type { Dispatch } from "metabase/redux/store";
import {
  fetchTableMetadata,
  fetchTableMetadataAndForeignKeys,
} from "metabase/redux/tables";
import { DatabaseSchema, FieldSchema, TableSchema } from "metabase/schema";
import { checkNotNull } from "metabase/utils/types";
import type {
  Database,
  DatabaseId,
  Field,
  GetDatabaseMetadataRequest,
  Segment,
  SegmentId,
  Table,
  TableId,
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
  (dispatch: Dispatch): Promise<Segment[]> =>
    runRtkEndpoint(undefined, dispatch, segmentApi.endpoints.listSegments);

/**
 * Resolves a segment's table from the list response rather than from
 * `state.entities`, so these thunks do not read the mirror they feed.
 */
const fetchSegmentTableId =
  (segmentId: SegmentId) =>
  async (dispatch: Dispatch): Promise<TableId> => {
    const segments = await fetchSegments()(dispatch);
    const segment = segments.find(({ id }) => id === segmentId);
    return checkNotNull(segment).table_id;
  };

export const updateSegment =
  (segment: Segment) =>
  (dispatch: Dispatch): Promise<unknown> =>
    runRtkEndpoint(segment, dispatch, segmentApi.endpoints.updateSegment);

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

// Private: the only caller left is `fetchSegmentFields` below. It deletes with
// that thunk.
const fetchDatabaseMetadata =
  (id: DatabaseId) =>
  (dispatch: Dispatch): Promise<unknown> =>
    runRtkEndpoint(
      { id, skip_fields: true } satisfies GetDatabaseMetadataRequest,
      dispatch,
      databaseApi.endpoints.getDatabaseMetadata,
      { forceRefetch: false },
    );

const FETCH_SEGMENT_FIELDS = "metabase/metadata/FETCH_SEGMENT_FIELDS";
export const fetchSegmentFields = createThunkAction(
  FETCH_SEGMENT_FIELDS,
  (segmentId: SegmentId) => {
    return async (dispatch) => {
      const tableId = await dispatch(fetchSegmentTableId(segmentId));
      await dispatch(fetchTableMetadataAndForeignKeys({ id: tableId }));
      // Annotated, not cast: `fetchTableMetadata` returns the endpoint's
      // untyped result and `db_id` is the only field this needs.
      const table: { db_id: DatabaseId } = await dispatch(
        fetchTableMetadata({ id: tableId }),
      );
      await dispatch(fetchDatabaseMetadata(table.db_id));
    };
  },
);

const FETCH_SEGMENT_TABLE = "metabase/metadata/FETCH_SEGMENT_TABLE";
export const fetchSegmentTable = createThunkAction(
  FETCH_SEGMENT_TABLE,
  (segmentId: SegmentId) => {
    return async (dispatch) => {
      const tableId = await dispatch(fetchSegmentTableId(segmentId));
      await dispatch(fetchTableMetadataAndForeignKeys({ id: tableId }));
    };
  },
);

const FETCH_SEGMENT_REVISIONS = "metabase/metadata/FETCH_SEGMENT_REVISIONS";
export const fetchSegmentRevisions = createThunkAction(
  FETCH_SEGMENT_REVISIONS,
  (segmentId: SegmentId) => {
    return async (dispatch) => {
      const [, tableId] = await Promise.all([
        dispatch(fetchRevisions("segment", segmentId)),
        dispatch(fetchSegmentTableId(segmentId)),
      ]);
      await dispatch(fetchTableMetadataAndForeignKeys({ id: tableId }));
    };
  },
);
