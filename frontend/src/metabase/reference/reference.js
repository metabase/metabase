import { handleActions, createAction, createThunkAction } from 'metabase/lib/redux';

import i from 'icepick';

const START_EDITING = "metabase/reference/START_EDITING";
export const startEditing = createAction(START_EDITING);

const END_EDITING = "metabase/reference/END_EDITING";
export const endEditing = createAction(END_EDITING);

const initialState = {
    isEditing: false
};
export default handleActions({
    [START_EDITING]: {
        next: (state) => i.assoc(state, 'isEditing', true)
    },
    [END_EDITING]: {
        next: (state) => i.assoc(state, 'isEditing', false)
    }
}, initialState);
