import { createReducer } from "@reduxjs/toolkit";

import {
  combineReducers,
  createAsyncThunk,
  createThunkAction,
  handleActions,
} from "metabase/lib/redux";
import { MetabaseApi, RevisionsApi } from "metabase/services";

export const UPDATE_PREVIEW_SUMMARY =
  "metabase/admin/datamodel/UPDATE_PREVIEW_SUMMARY";

export const updatePreviewSummary = createAsyncThunk(
  UPDATE_PREVIEW_SUMMARY,
  async query => {
    const result = await MetabaseApi.dataset(query);
    return result.data.rows[0][0];
  },
);

// REVISION HISTORY

export const FETCH_REVISIONS = "metabase/admin/datamodel/FETCH_REVISIONS";

export const fetchSegmentRevisions = createThunkAction(
  FETCH_REVISIONS,
  id => async () => RevisionsApi.get({ entity: "segment", id }),
);

// reducers

const previewSummary = createReducer(null, builder =>
  builder.addCase(
    updatePreviewSummary.fulfilled,
    (state, { payload }) => payload,
  ),
);

const revisions = handleActions(
  { [FETCH_REVISIONS]: { next: (state, { payload }) => payload } },
  null,
);

export default combineReducers({ previewSummary, revisions });
