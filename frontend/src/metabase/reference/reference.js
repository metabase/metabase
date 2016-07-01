import { createAction, createThunkAction } from 'metabase/lib/redux';

import i from 'icepick';
import _ from 'underscore';

const initialState = {
    entities: {},
    section: null
};

const SELECT_SECTION = 'metabase/reference/SELECT_SECTION';

export const selectSection = createThunkAction(SELECT_SECTION, (sectionId = 'guide', type = 'reference') => {
    return async (dispatch, getState) => {
        return { type, sectionId };
    };
})

export default (state = initialState, { type, payload, error }) => {
    switch (type) {
        case SELECT_SECTION:
            return { ...state, sectionId: payload.section };
        default:
            return state;
    }
}
