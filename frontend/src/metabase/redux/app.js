import { push, LOCATION_CHANGE } from "react-router-redux";
import { createSelector } from "@reduxjs/toolkit";

import {
  combineReducers,
  createAction,
  handleActions,
} from "metabase/lib/redux";
import {
  isSmallScreen,
  openInBlankWindow,
  shouldOpenInBlankWindow,
} from "metabase/lib/dom";

import { getEmbedOptions, getIsEmbedded } from "metabase/selectors/embed";
import { getIsAppBarVisible } from "metabase/selectors/app";

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

const PATHS_WITH_COLLAPSED_NAVBAR = [
  /\/model.*/,
  /\/question.*/,
  /\/dashboard.*/,
  /\/metabot.*/,
];

function checkIsSidebarInitiallyOpen() {
  return (
    !isSmallScreen() &&
    !PATHS_WITH_COLLAPSED_NAVBAR.some(pattern =>
      pattern.test(window.location.pathname),
    )
  );
}

export const OPEN_NAVBAR = "metabase/app/OPEN_NAVBAR";
export const CLOSE_NAVBAR = "metabase/app/CLOSE_NAVBAR";
export const TOGGLE_NAVBAR = "metabase/app/TOGGLE_NAVBAR";

export const openNavbar = createAction(OPEN_NAVBAR);
export const closeNavbar = createAction(CLOSE_NAVBAR);
export const toggleNavbar = createAction(TOGGLE_NAVBAR);

export const getIsNavbarOpen = createSelector(
  [
    getIsEmbedded,
    getEmbedOptions,
    getIsAppBarVisible,
    state => state.app.isNavbarOpen,
  ],
  (isEmbedded, embedOptions, isAppBarVisible, isNavbarOpen) => {
    // in an embedded instance, when the app bar is hidden, but the nav bar is not
    // we need to force the sidebar to be open or else it will be totally inaccessible
    if (isEmbedded && embedOptions.side_nav === true && !isAppBarVisible) {
      return true;
    }

    return isNavbarOpen;
  },
);

const isNavbarOpen = handleActions(
  {
    [OPEN_NAVBAR]: () => true,
    [TOGGLE_NAVBAR]: isOpen => !isOpen,
    [CLOSE_NAVBAR]: () => false,
  },
  checkIsSidebarInitiallyOpen(),
);

export default combineReducers({
  errorPage,
  isNavbarOpen,
});
