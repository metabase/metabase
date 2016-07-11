import { handleActions, createAction, createThunkAction } from 'metabase/lib/redux';

import i from 'icepick';

const TOGGLE_EDITING = "metabase/reference/TOGGLE_EDITING";
export const toggleEditing = createAction(TOGGLE_EDITING);

const initialState = {
    isEditing: false
};
export default handleActions({
    [TOGGLE_EDITING]: {
        next: (state) => i.assoc(state, 'isEditing', !state['isEditing'])
    }
}, initialState);
