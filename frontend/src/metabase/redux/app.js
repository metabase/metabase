import { combineReducers, handleActions, createAction } from "metabase/lib/redux";

import { LOCATION_CHANGE } from "react-router-redux"

export const SET_ERROR_PAGE = "metabase/app/SET_ERROR_PAGE";

export const setErrorPage = createAction(SET_ERROR_PAGE);

const errorPage = handleActions({
    [SET_ERROR_PAGE]: (state, { payload }) => payload,
    [LOCATION_CHANGE]: () => null
}, null);

export default combineReducers({
    errorPage
});
