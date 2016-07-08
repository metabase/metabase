import { createAction, createThunkAction } from 'metabase/lib/redux';

import i from 'icepick';

const initialState = {};
// Placeholder reducer for gettings started guide state
// State for everything else is stored in metabase/redux/metadata
export default (state = initialState, { type, payload, error }) => {
    switch (type) {
        default:
            return state;
    }
}
