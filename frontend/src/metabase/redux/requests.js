import { handleActions, createAction } from "metabase/lib/redux";
import i from "icepick";

const SET_REQUEST_STATE = "metabase/requests/SET_REQUEST_STATE";

export const setRequestState = createAction(SET_REQUEST_STATE);

export default handleActions({
    //TODO: add a CLEAR_REQUEST action?
    [SET_REQUEST_STATE]: {
        next: (state, { payload }) => i.assocIn(
            state,
            payload.statePath,
            { state: payload.state, error: payload.error }
        )
    }
}, {});
