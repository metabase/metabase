"use strict";

import { handleActions } from 'redux-actions';

import {
    FETCH_CARDS,
    SELECT_DASHBOARD,
    SET_EDITING_DASHBOARD,
    FETCH_DASHBOARD,
    FETCH_DASHCARD_DATASET,
    SET_DASHBOARD_ATTRIBUTES,
    SET_DASHCARD_ATTRIBUTES,
    ADD_CARD_TO_DASH,
    REMOVE_CARD_FROM_DASH,
    DELETE_CARD,
} from './actions';

export const selectedDashboard = handleActions({
    [SELECT_DASHBOARD]: { next: (state, action) => action.payload }
}, null);

export const isEditing = handleActions({
    [SET_EDITING_DASHBOARD]: { next: (state, action) => action.payload }
}, false);

export const cards = handleActions({
    [FETCH_CARDS]: { next: (state, action) => ({ ...action.payload.entities.card }) }
}, {});

export const cardList = handleActions({
    [FETCH_CARDS]: { next: (state, action) => action.payload.result },
    [DELETE_CARD]: { next: (state, action) => state }
}, []);

export const dashboards = handleActions({
    [FETCH_DASHBOARD]: { next: (state, action) => ({ ...state, ...action.payload.entities.dashboard }) },
    [SET_DASHBOARD_ATTRIBUTES]: {
        next: (state, { payload: { id, attributes } }) => ({
            ...state,
            [id]: { ...state[id], ...attributes, isDirty: true }
        })
    },
    [ADD_CARD_TO_DASH]: (state, { payload: dashcard }) => ({
        ...state, [dashcard.dashboard_id]: { ...state[dashcard.dashboard_id], ordered_cards: state[dashcard.dashboard_id].ordered_cards.concat(dashcard.id), isDirty: true }
    }),
    [REMOVE_CARD_FROM_DASH]: (state, { payload: { dashId } }) => ({
        ...state, [dashId]: { ...state[dashId], isDirty: true }
    })
}, {});

export const dashcards = handleActions({
    [FETCH_DASHBOARD]:  { next: (state, action) => ({ ...state, ...action.payload.entities.dashcard }) },
    [SET_DASHCARD_ATTRIBUTES]: {
        next: (state, { payload: { id, attributes } }) => ({
            ...state,
            [id]: { ...state[id], ...attributes, isDirty: true }
        })
    },
    [ADD_CARD_TO_DASH]: (state, { payload: dashcard }) => ({
        ...state,
        [dashcard.id]: { ...dashcard, isAdded: true }
    }),
    [REMOVE_CARD_FROM_DASH]: (state, { payload: { dashcardId }}) => ({
        ...state,
        [dashcardId]: { ...state[dashcardId], isRemoved: true }
    })
}, {});

export const dashcardDatasets = handleActions({
    [FETCH_DASHCARD_DATASET]: { next: (state, { payload: { id, result }}) => ({ ...state, [id]: result }) }
}, {});
