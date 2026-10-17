import {
  type PayloadAction,
  createAction,
  createSlice,
} from "@reduxjs/toolkit";

import { combineReducers, handleActions } from "metabase/redux";
import type {
  DetailViewState,
  TempStorage,
  TempStorageKey,
  TempStorageValue,
} from "metabase/redux/store";
import { LOCATION_CHANGE, navigate } from "metabase/router";
import { shouldOpenInBlankWindow } from "metabase/urls";
import { isSmallScreen, openInBlankWindow } from "metabase/utils/dom";

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

export const openUrl = (url: string) => () => {
  if (shouldOpenInBlankWindow(url)) {
    openInBlankWindow(url);
  } else {
    navigate(url);
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
    // The navbar only opens or closes on explicit user action, so navigation
    // keeps whatever state the user last chose. The one exception is small
    // screens, where an open navbar would cover the whole page.
    [LOCATION_CHANGE]: (
      prevState: boolean,
      { payload }: LocationChangeAction,
    ) => {
      if (payload.state?.preserveNavbarState) {
        return prevState;
      }

      return isSmallScreen() ? false : prevState;
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
  // Unjustified type cast. FIXME
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
