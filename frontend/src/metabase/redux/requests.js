/* @flow weak */

import { handleActions, createAction } from "metabase/lib/redux";
import { assocIn } from "icepick";

const SET_REQUEST_STATE = "metabase/requests/SET_REQUEST_STATE";
const CLEAR_REQUEST_STATE = "metabase/requests/CLEAR_REQUEST_STATE";

export const setRequestState = createAction(SET_REQUEST_STATE);
export const clearRequestState = createAction(CLEAR_REQUEST_STATE);

export default handleActions({
    [SET_REQUEST_STATE]: {
        next: (state, { payload }) => assocIn(
            state,
            payload.statePath,
            { state: payload.state, error: payload.error }
        )
    },
    [CLEAR_REQUEST_STATE]: {
        next: (state, { payload }) => assocIn(
            state,
            payload.statePath,
            undefined
        )
    }
}, {});
