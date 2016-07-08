import { handleActions, createAction } from "metabase/lib/redux";
import i from "icepick";

const SET_REQUEST = "metabase/requests/SET_REQUEST";

export const setRequest = createAction(SET_REQUEST, undefined, (payload, meta) => meta);

export default handleActions({
    //TODO: add a CLEAR_REQUEST action?
    [SET_REQUEST]: {
        next: (state, { payload }) => payload.id ?
            i.assocIn(state, [payload.type, payload.id], payload.state) :
            i.assoc(state, payload.type, payload.state),
        throw: (state, { payload, meta, error }) => meta.id ?
            i.assocIn(state, [meta.type, meta.id, 'error'], payload) :
            i.assocIn(state, [meta.type, 'error'], payload)
    }
}, {});
