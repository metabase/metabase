import { push, LOCATION_CHANGE } from "react-router-redux";
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

import type { Dispatch } from "metabase-types/store";

export const SET_ERROR_PAGE = "metabase/app/SET_ERROR_PAGE";
export function setErrorPage(error: any) {
  console.error("Error:", error);
  return {
    type: SET_ERROR_PAGE,
    payload: error,
  };
}

interface IOpenUrlOptions {
  blank?: boolean;
  event?: Event;
  blankOnMetaOrCtrlKey?: boolean;
  blankOnDifferentOrigin?: boolean;
}

export const openUrl =
  (url: string, options: IOpenUrlOptions) => (dispatch: Dispatch) => {
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

const isNavbarOpen = handleActions(
  {
    [OPEN_NAVBAR]: () => true,
    [TOGGLE_NAVBAR]: isOpen => !isOpen,
    [CLOSE_NAVBAR]: () => false,
  },
  checkIsSidebarInitiallyOpen(),
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default combineReducers({
  errorPage,
  isNavbarOpen,
});
