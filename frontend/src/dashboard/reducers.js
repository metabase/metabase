import { handleActions, combineReducers } from "metabase/lib/redux";

import {
    FETCH_CARDS,
    SELECT_DASHBOARD,
    SET_EDITING_DASHBOARD,
    FETCH_DASHBOARD,
    FETCH_CARD_DATA,
    SET_DASHBOARD_ATTRIBUTES,
    SET_DASHCARD_ATTRIBUTES,
    ADD_CARD_TO_DASH,
    REMOVE_CARD_FROM_DASH,
    DELETE_CARD,
    FETCH_REVISIONS,
    MARK_NEW_CARD_SEEN,
    FETCH_DATABASE_METADATA
} from './actions';

export const selectedDashboard = handleActions({
    [SELECT_DASHBOARD]: { next: (state, { payload }) => payload }
}, null);

export const isEditing = handleActions({
    [SET_EDITING_DASHBOARD]: { next: (state, { payload }) => payload }
}, false);

export const cards = handleActions({
    [FETCH_CARDS]: { next: (state, { payload }) => ({ ...payload.entities.card }) }
}, {});

export const cardList = handleActions({
    [FETCH_CARDS]: { next: (state, { payload }) => payload.result },
    [DELETE_CARD]: { next: (state, { payload }) => state }
}, null);

export const dashboards = handleActions({
    [FETCH_DASHBOARD]: { next: (state, { payload }) => ({ ...state, ...payload.entities.dashboard }) },
    [SET_DASHBOARD_ATTRIBUTES]: {
        next: (state, { payload: { id, attributes } }) => ({
            ...state,
            [id]: { ...state[id], ...attributes, isDirty: true }
        })
    },
    [ADD_CARD_TO_DASH]: (state, { payload: dashcard }) => ({
        ...state, [dashcard.dashboard_id]: { ...state[dashcard.dashboard_id], ordered_cards: [...state[dashcard.dashboard_id].ordered_cards, dashcard.id] }
    }),
}, {});

export const dashcards = handleActions({
    [FETCH_DASHBOARD]:  { next: (state, { payload }) => ({ ...state, ...payload.entities.dashcard }) },
    [SET_DASHCARD_ATTRIBUTES]: {
        next: (state, { payload: { id, attributes } }) => ({
            ...state,
            [id]: { ...state[id], ...attributes, isDirty: true }
        })
    },
    [ADD_CARD_TO_DASH]: (state, { payload: dashcard }) => ({
        ...state,
        [dashcard.id]: { ...dashcard, isAdded: true, justAdded: true }
    }),
    [REMOVE_CARD_FROM_DASH]: (state, { payload: { dashcardId }}) => ({
        ...state,
        [dashcardId]: { ...state[dashcardId], isRemoved: true }
    }),
    [MARK_NEW_CARD_SEEN]: (state, { payload: dashcardId }) => ({
        ...state,
        [dashcardId]: { ...state[dashcardId], justAdded: false }
    })
}, {});

export const revisions = handleActions({
    [FETCH_REVISIONS]: { next: (state, { payload: { entity, id, revisions } }) => ({ ...state, [entity+'-'+id]: revisions })}
}, {});

export const cardData = handleActions({
    [FETCH_CARD_DATA]: { next: (state, { payload: { id, result }}) => ({ ...state, [id]: result }) }
}, {});

const databases = handleActions({
    [FETCH_DATABASE_METADATA]: { next: (state, { payload }) => ({ ...state, [payload.id]: payload }) }
}, {});

export const metadata = combineReducers({
    databases
});
