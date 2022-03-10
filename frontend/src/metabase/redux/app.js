import { push, LOCATION_CHANGE } from "react-router-redux";

import { combineReducers, handleActions } from "metabase/lib/redux";
import { openInBlankWindow, shouldOpenInBlankWindow } from "metabase/lib/dom";

export const SET_ERROR_PAGE = "metabase/app/SET_ERROR_PAGE";
export function setErrorPage(error) {
  console.error("Error:", error);
  return {
    type: SET_ERROR_PAGE,
    payload: error,
  };
}

export const openUrl = (url, options) => dispatch => {
  if (shouldOpenInBlankWindow(url, options)) {
    openInBlankWindow(url);
  } else {
    dispatch(push(url));
  }
};

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
