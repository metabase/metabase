import {
  type PayloadAction,
  createAction,
  createSlice,
} from "@reduxjs/toolkit";
import { LOCATION_CHANGE, push } from "react-router-redux";

import {
  isSmallScreen,
  openInBlankWindow,
  shouldOpenInBlankWindow,
} from "metabase/lib/dom";
import { combineReducers, handleActions } from "metabase/lib/redux";
import type {
  DetailViewState,
  Dispatch,
  TempStorage,
  TempStorageKey,
  TempStorageValue,
} from "metabase-types/store";

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

const SET_ERROR_PAGE = "metabase/app/SET_ERROR_PAGE";
export function setErrorPage(error: any) {
  console.error("Error:", error);
  return {
    type: SET_ERROR_PAGE,
    payload: error,
  };
}

const RESET_ERROR_PAGE = "metabase/app/RESET_ERROR_PAGE";
export function resetErrorPage() {
  return {
    type: RESET_ERROR_PAGE,
  };
}

interface IOpenUrlOptions {
  blank?: boolean;
  event?: MouseEvent;
  blankOnMetaOrCtrlKey?: boolean;
  blankOnDifferentOrigin?: boolean;
}

export const openUrl =
  (url: string, options: IOpenUrlOptions = {}) =>
  (dispatch: Dispatch) => {
    if (shouldOpenInBlankWindow(url, options)) {
      openInBlankWindow(url);
    } else {
      dispatch(push(url));
    }
  };

const errorPage = handleActions(
  {
    [SET_ERROR_PAGE]: (_, { payload }) => payload,
    [RESET_ERROR_PAGE]: () => null,
    [LOCATION_CHANGE]: () => null,
  },
  null,
);

// regexr.com/7r89i
// A word boundary is added to /model so it doesn't match /browse/models
const PATH_WITH_COLLAPSED_NAVBAR =
  /\/(model\b|question|dashboard|metabot|document).*/;

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
    [TOGGLE_NAVBAR]: (isOpen) => !isOpen,
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

export const OPEN_DIAGNOSTICS = "metabase/app/OPEN_DIAGNOSTIC_MODAL";
export const CLOSE_DIAGNOSTICS = "metabase/app/CLOSE_DIAGNOSTIC_MODAL";

export const openDiagnostics = createAction(OPEN_DIAGNOSTICS);
export const closeDiagnostics = createAction(CLOSE_DIAGNOSTICS);

const isErrorDiagnosticsOpen = handleActions(
  {
    [OPEN_DIAGNOSTICS]: () => true,
    [CLOSE_DIAGNOSTICS]: () => false,
  },
  false,
);

export const SET_DETAIL_VIEW = "metabase/app/SET_DETAIL_VIEW";

export const setDetailView = createAction<DetailViewState | null>(
  SET_DETAIL_VIEW,
);

const detailView = handleActions(
  {
    [SET_DETAIL_VIEW]: {
      next: (_oldState, { payload: newState }) => newState,
    },
  },
  null,
);

const tempStorageSlice = createSlice({
  name: "tempStorage",
  initialState: {} as TempStorage,
  reducers: {
    setTempSetting: (
      state,
      action: PayloadAction<{
        key: TempStorageKey;
        value: TempStorageValue<TempStorageKey>;
      }>,
    ) => {
      state[action.payload.key] = action.payload.value;
    },
  },
});

export const { setTempSetting } = tempStorageSlice.actions;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default combineReducers({
  detailView,
  errorPage,
  isNavbarOpen,
  isDndAvailable: (initValue: unknown) => {
    if (typeof initValue === "boolean") {
      return initValue;
    }
    return true;
  },
  isErrorDiagnosticsOpen,
  tempStorage: tempStorageSlice.reducer,
});
