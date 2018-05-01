import { combineReducers, handleActions } from "metabase/lib/redux";

import { LOCATION_CHANGE } from "react-router-redux";

export const SET_ERROR_PAGE = "metabase/app/SET_ERROR_PAGE";
export function setErrorPage(error) {
  console.error("Error:", error);
  return {
    type: SET_ERROR_PAGE,
    payload: error,
  };
}

const errorPage = handleActions(
  {
    [SET_ERROR_PAGE]: (state, { payload }) => payload,
    [LOCATION_CHANGE]: () => null,
  },
  null,
);

export default combineReducers({
  errorPage,
});
