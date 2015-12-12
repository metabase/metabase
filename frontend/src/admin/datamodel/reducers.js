
import { handleActions } from "redux-actions";

import { momentifyTimestamps } from "metabase/lib/redux";

import {
    NEW_SEGMENT,
    GET_SEGMENT,
    CREATE_SEGMENT,
    UPDATE_SEGMENT,
    DELETE_SEGMENT,
    SET_CURRENT_SEGMENT_ID,
    LOAD_TABLE_METADATA,
    UPDATE_RESULT_COUNT,
    FETCH_REVISIONS
} from "./actions";

export const segments = handleActions({
    [NEW_SEGMENT]:    { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [GET_SEGMENT]:    { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [CREATE_SEGMENT]: { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [UPDATE_SEGMENT]: { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [DELETE_SEGMENT]: { next: (state, { payload }) => { state = { ...state }; delete state[payload.id]; return state; }}
}, {});

export const currentSegmentId = handleActions({
    [SET_CURRENT_SEGMENT_ID]: { next: (state, { payload: segmentId }) => segmentId },
    [CREATE_SEGMENT]: { next: (state, { payload: segment }) => segment.id }
}, null);

export const tableMetadata = handleActions({
    [LOAD_TABLE_METADATA]: {
        next: (state, { payload }) => payload.table,
        throw: (state, action) => null
    }
}, null);

export const resultCount = handleActions({
    [UPDATE_RESULT_COUNT]: { next: (state, { payload: resultCount }) => resultCount }
}, null);

export const revisionObject = handleActions({
    [FETCH_REVISIONS]: { next: (state, { payload: revisionObject }) => revisionObject }
}, null);
