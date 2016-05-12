
import { handleActions } from 'redux-actions';

import { momentifyTimestamps, momentifyObjectsTimestamps } from "metabase/lib/redux";

import {
    FETCH_PULSES,
    SET_EDITING_PULSE,
    UPDATE_EDITING_PULSE,
    SAVE_EDITING_PULSE,
    SAVE_PULSE,
    FETCH_CARDS,
    FETCH_USERS,
    FETCH_PULSE_FORM_INPUT,
    FETCH_PULSE_CARD_PREVIEW
} from "./actions";

export const pulses = handleActions({
    [FETCH_PULSES]:       { next: (state, { payload }) => ({ ...momentifyObjectsTimestamps(payload.entities.pulse) }) },
    [SAVE_PULSE]:         { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) },
    [SAVE_EDITING_PULSE]: { next: (state, { payload }) => ({ ...state, [payload.id]: momentifyTimestamps(payload) }) }
}, {});

export const pulseList = handleActions({
    [FETCH_PULSES]: { next: (state, { payload }) => payload.result },
    // [DELETE_PULSE]: { next: (state, { payload }) => state }
}, null);

export const editingPulse = handleActions({
    [SET_EDITING_PULSE]:    { next: (state, { payload }) => payload },
    [UPDATE_EDITING_PULSE]: { next: (state, { payload }) => payload },
    [SAVE_EDITING_PULSE]:   { next: (state, { payload }) => payload }
}, { name: null, cards: [], channels: [] });


// NOTE: duplicated from dashboards/reducers.js
export const cards = handleActions({
    [FETCH_CARDS]: { next: (state, { payload }) => ({ ...momentifyObjectsTimestamps(payload.entities.card) }) }
}, {});
export const cardList = handleActions({
    [FETCH_CARDS]: { next: (state, { payload }) => payload.result }
}, []);

// NOTE: duplicated from admin/people/reducers.js
export const users = handleActions({
    [FETCH_USERS]: { next: (state, { payload }) => ({ ...momentifyObjectsTimestamps(payload.entities.user) }) }
}, []);

export const formInput = handleActions({
    [FETCH_PULSE_FORM_INPUT]: { next: (state, { payload }) => payload }
}, {});

export const cardPreviews = handleActions({
    [FETCH_PULSE_CARD_PREVIEW]: { next: (state, { payload }) => ({ ...state, [payload.id]: payload })}
}, {});
