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

export function getIsNavbarOpen(state) {
  return state.app.isNavbarOpen;
}

const isNavbarOpen = handleActions(
  {
    [OPEN_NAVBAR]: () => true,
    [TOGGLE_NAVBAR]: isOpen => !isOpen,
    [CLOSE_NAVBAR]: () => false,
  },
  checkIsSidebarInitiallyOpen(),
);

export const SET_COLLECTION_ID = "metabase/app/SET_COLLECTION_ID";
export const CLEAR_BREADCRUMBS = "metabase/app/CLEAR_BREADCRUMBS";
export const setCollectionId = createAction(SET_COLLECTION_ID);
export const clearBreadcrumbs = createAction(CLEAR_BREADCRUMBS);
const defaultBreadcumbsState = {
  collectionId: "",
  show: false,
};

const breadcrumbs = handleActions(
  {
    [SET_COLLECTION_ID]: {
      next: (_state, { payload }) => ({ show: true, collectionId: payload }),
    },
    [CLEAR_BREADCRUMBS]: {
      next: () => ({ show: false, collectionId: undefined }),
    },
  },
  defaultBreadcumbsState,
);

export default combineReducers({
  errorPage,
  isNavbarOpen,
  breadcrumbs,
});
