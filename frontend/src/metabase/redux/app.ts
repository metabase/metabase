import { push, LOCATION_CHANGE } from "react-router-redux";

import {
  isSmallScreen,
  openInBlankWindow,
  shouldOpenInBlankWindow,
} from "metabase/lib/dom";
import {
  combineReducers,
  createAction,
  handleActions,
} from "metabase/lib/redux";
import type { Dispatch } from "metabase-types/store";

interface LocationChangeAction {
  type: string; // "@@router/LOCATION_CHANGE"
  payload: {
    pathname: string;
    search: string;
    hash: string;
    action: string;
    key: string;
    state?: any;
    query?: any;
  };
}

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
    [SET_ERROR_PAGE]: (_, { payload }) => payload,
    [LOCATION_CHANGE]: () => null,
  },
  null,
);

// regexr.com/7r89i
// A word boundary is added to /model so it doesn't match /browse/models
const PATH_WITH_COLLAPSED_NAVBAR = /\/(model\b|question|dashboard|metabot).*/;

export function isNavbarOpenForPathname(pathname: string, prevState: boolean) {
  return (
    !isSmallScreen() && !PATH_WITH_COLLAPSED_NAVBAR.test(pathname) && prevState
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
    [LOCATION_CHANGE]: (
      prevState: boolean,
      { payload }: LocationChangeAction,
    ) => {
      if (payload.state?.preserveNavbarState) {
        return prevState;
      }

      return isNavbarOpenForPathname(payload.pathname, prevState);
    },
  },
  true,
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default combineReducers({
  errorPage,
  isNavbarOpen,
});
