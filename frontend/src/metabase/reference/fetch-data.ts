import { cardApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import type { Dispatch } from "metabase/redux/store";
import { fetchTableMetadataAndForeignKeys } from "metabase/redux/tables";
import {
  fetchSegmentFields,
  fetchSegmentRevisions,
  fetchSegmentTable,
  fetchSegments,
} from "metabase/reference/segments/thunks";
import type { SegmentId, TableId } from "metabase-types/api";

/**
 * What each reference page loads. Loading state is reported separately, by
 * `useReferenceFetch`.
 */

const fetchQuestions = (dispatch: Dispatch) =>
  runRtkEndpoint({}, dispatch, cardApi.endpoints.listCards);

export const fetchTableData = (dispatch: Dispatch, tableId: TableId) =>
  dispatch(fetchTableMetadataAndForeignKeys({ id: tableId }));

export const fetchSegmentListData = (dispatch: Dispatch) =>
  dispatch(fetchSegments());

export const fetchSegmentDetailData = (
  dispatch: Dispatch,
  segmentId: SegmentId,
) => dispatch(fetchSegmentTable(segmentId));

export const fetchSegmentQuestionsData = async (
  dispatch: Dispatch,
  segmentId: SegmentId,
) => {
  await dispatch(fetchSegments());
  await Promise.all([
    dispatch(fetchSegmentTable(segmentId)),
    fetchQuestions(dispatch),
  ]);
};

export const fetchSegmentRevisionsData = async (
  dispatch: Dispatch,
  segmentId: SegmentId,
) => {
  await dispatch(fetchSegments());
  await Promise.all([
    dispatch(fetchSegmentRevisions(segmentId)),
    dispatch(fetchSegmentTable(segmentId)),
  ]);
};

export const fetchSegmentFieldsData = async (
  dispatch: Dispatch,
  segmentId: SegmentId,
) => {
  await dispatch(fetchSegments());
  await Promise.all([
    dispatch(fetchSegmentFields(segmentId)),
    dispatch(fetchSegmentTable(segmentId)),
  ]);
};
