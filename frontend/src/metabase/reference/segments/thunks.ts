import { databaseApi, segmentApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { createThunkAction } from "metabase/redux";
import { fetchRevisions } from "metabase/redux/revisions";
import type { Dispatch } from "metabase/redux/store";
import {
  fetchTableMetadata,
  fetchTableMetadataAndForeignKeys,
} from "metabase/redux/tables";
import { checkNotNull } from "metabase/utils/types";
import type {
  DatabaseId,
  GetDatabaseMetadataRequest,
  Segment,
  SegmentId,
  TableId,
} from "metabase-types/api";

/**
 * Fetch orchestration for the reference segment pages.
 */

export const fetchSegments =
  () =>
  (dispatch: Dispatch): Promise<Segment[]> =>
    runRtkEndpoint(undefined, dispatch, segmentApi.endpoints.listSegments);

/**
 * Resolves a segment's table from the list response.
 */
const fetchSegmentTableId =
  (segmentId: SegmentId) =>
  async (dispatch: Dispatch): Promise<TableId> => {
    const segments = await fetchSegments()(dispatch);
    const segment = segments.find(({ id }) => id === segmentId);
    return checkNotNull(segment).table_id;
  };

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
