import { handleActions, createAction, createThunkAction } from 'metabase/lib/redux';

import i from 'icepick';

const START_LOADING = "metabase/reference/START_LOADING";
export const startLoading = createAction(START_LOADING);

const END_LOADING = "metabase/reference/END_LOADING";
export const endLoading = createAction(END_LOADING);

const START_EDITING = "metabase/reference/START_EDITING";
export const startEditing = createAction(START_EDITING);

const END_EDITING = "metabase/reference/END_EDITING";
export const endEditing = createAction(END_EDITING);

const initialState = {
    isLoading: false,
    isEditing: false
};
export default handleActions({
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
