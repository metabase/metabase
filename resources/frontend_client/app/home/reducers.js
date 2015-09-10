"use strict";

import { handleActions } from 'redux-actions';

import {
    SET_SELECTED_TAB,
    SET_CARDS_FILTER,
    FETCH_ACTIVITY,
    FETCH_CARDS,
    FETCH_DATABASES,
    CLEAR_DATABASE_METADATA,
    FETCH_DATABASE_METADATA,
    FETCH_RECENT_VIEWS
} from './actions';


export const selectedTab = handleActions({
    [SET_SELECTED_TAB]: { next: (state, { payload }) => payload }
}, 'activity');

export const cardsFilter = handleActions({
    [SET_CARDS_FILTER]: { next: (state, { payload }) => payload }
}, {database: null, table: null});


export const activity = handleActions({
    [FETCH_ACTIVITY]: { next: (state, { payload }) => payload }
}, null);

export const recentViews = handleActions({
	[FETCH_RECENT_VIEWS]: { next: (state, { payload }) => payload }
}, []);


export const cards = handleActions({
    [FETCH_CARDS]: { next: (state, { payload }) => payload }
}, null);


export const databases = handleActions({
    [FETCH_DATABASES]: { next: (state, { payload }) => payload }
}, []);


export const databaseMetadata = handleActions({
    [FETCH_DATABASE_METADATA]: { next: (state, { payload }) => payload },
    [CLEAR_DATABASE_METADATA]: { next: (state, { payload }) => null }
}, null);

