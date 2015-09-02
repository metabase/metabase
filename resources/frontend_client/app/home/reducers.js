"use strict";

import { handleActions } from 'redux-actions';

import {
    SET_SELECTED_TAB,
    FETCH_ACTIVITY,
    FETCH_CARDS
} from './actions';


export const selectedTab = handleActions({
    [SET_SELECTED_TAB]: { next: (state, { payload }) => payload }
}, 'activity');

export const activity = handleActions({
    [FETCH_ACTIVITY]: { next: (state, { payload }) => ({ ...payload.entities.activity }) }
}, {});

export const activityIdList = handleActions({
    [FETCH_ACTIVITY]: { next: (state, { payload }) => payload.result }
}, null);

export const cards = handleActions({
    [FETCH_CARDS]: { next: (state, { payload }) => ({ ...payload.entities.card }) }
}, {});

export const cardIdList = handleActions({
    [FETCH_CARDS]: { next: (state, { payload }) => payload.result }
}, null);