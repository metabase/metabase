import { handleActions, createAction } from 'metabase/lib/redux';

import i from 'icepick';

const SET_ERROR = "metabase/reference/SET_ERROR";
export const setError = createAction(SET_ERROR);

const CLEAR_ERROR = "metabase/reference/CLEAR_ERROR";
export const clearError = createAction(CLEAR_ERROR);

const START_LOADING = "metabase/reference/START_LOADING";
export const startLoading = createAction(START_LOADING);

const END_LOADING = "metabase/reference/END_LOADING";
export const endLoading = createAction(END_LOADING);

const START_EDITING = "metabase/reference/START_EDITING";
export const startEditing = createAction(START_EDITING);

const END_EDITING = "metabase/reference/END_EDITING";
export const endEditing = createAction(END_EDITING);

const initialState = {
    error: null,
    isLoading: false,
    isEditing: false
};
export default handleActions({
    [SET_ERROR]: {
        throw: (state, { payload }) => i.assoc(state, 'error', payload)
    },
    [CLEAR_ERROR]: {
        next: (state) => i.assoc(state, 'error', null)
    },
    [START_LOADING]: {
        next: (state) => i.assoc(state, 'isLoading', true)
    },
    [END_LOADING]: {
        next: (state) => i.assoc(state, 'isLoading', false)
    },
    [START_EDITING]: {
        next: (state) => i.assoc(state, 'isEditing', true)
    },
    [END_EDITING]: {
        next: (state) => i.assoc(state, 'isEditing', false)
    }
}, initialState);
