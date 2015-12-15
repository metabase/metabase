
import { handleActions } from "redux-actions";

import { momentifyTimestamps } from "metabase/lib/redux";

import {
    GET_SEGMENT,
    CREATE_SEGMENT,
    UPDATE_SEGMENT,
    DELETE_SEGMENT,
    GET_METRIC,
    CREATE_METRIC,
    UPDATE_METRIC,
    DELETE_METRIC,
    LOAD_TABLE_METADATA,
    UPDATE_PREVIEW_SUMMARY,
    FETCH_REVISIONS
} from "./actions";

export const segments = handleActions({
    [GET_SEGMENT]:    { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [CREATE_SEGMENT]: { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [UPDATE_SEGMENT]: { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [DELETE_SEGMENT]: { next: (state, { payload }) => { state = { ...state }; delete state[payload.id]; return state; }}
}, {});

export const metrics = handleActions({
    [GET_METRIC]:    { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [CREATE_METRIC]: { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [UPDATE_METRIC]: { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [DELETE_METRIC]: { next: (state, { payload }) => { state = { ...state }; delete state[payload.id]; return state; }}
}, {});

export const tableMetadata = handleActions({
    [LOAD_TABLE_METADATA]: {
        next: (state, { payload }) => payload.table,
        throw: (state, action) => null
    }
}, null);

export const previewSummary = handleActions({
    [UPDATE_PREVIEW_SUMMARY]: { next: (state, { payload }) => payload }
}, null);

export const revisionObject = handleActions({
    [FETCH_REVISIONS]: { next: (state, { payload: revisionObject }) => revisionObject }
}, null);
