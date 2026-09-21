import {
  type PayloadAction,
  createAction,
  createSlice,
} from "@reduxjs/toolkit";

import type {
  NavSection,
  OpenNavItem,
} from "metabase/nav/containers/MainNavbar/types";
import { combineReducers, handleActions } from "metabase/redux";
import type {
  PageBackground,
  PageCollection,
  TempStorage,
  TempStorageKey,
  TempStorageValue,
} from "metabase/redux/store";
import { LOCATION_CHANGE, navigate } from "metabase/router";
import { shouldOpenInBlankWindow } from "metabase/urls";
import { openInBlankWindow } from "metabase/utils/dom";

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

export const SET_PAGE_COLLECTION = "metabase/app/SET_PAGE_COLLECTION";

/**
 * Declares which collection the current page lives in, so the app header can
 * render its breadcrumbs. Pages publish this with the `useHeaderCollection`
 * hook; `null` clears the claim.
 */
export const setPageCollection = createAction<PageCollection | null>(
  SET_PAGE_COLLECTION,
);

const pageCollection = handleActions<PageCollection | null>(
  {
    [SET_PAGE_COLLECTION]: {
      next: (_state, { payload }) => payload,
    },
  },
  null,
);

export const SET_PAGE_BACKGROUND = "metabase/app/SET_PAGE_BACKGROUND";

/** Published by `PageContainer`, which paints the secondary page background. */
export const setPageBackground =
  createAction<PageBackground>(SET_PAGE_BACKGROUND);

const pageBackground = handleActions<PageBackground>(
  {
    [SET_PAGE_BACKGROUND]: {
      next: (_state, { payload }) => payload,
    },
  },
  "primary",
);

export const SET_NAV_SECTION = "metabase/app/SET_NAV_SECTION";
export const SET_NAV_SECTION_SEED = "metabase/app/SET_NAV_SECTION_SEED";

export const setNavSection = createAction<NavSection>(SET_NAV_SECTION);

/**
 * The section the thing currently on screen belongs to, so reloading an official metric comes back
 * on the Official rail instead of falling to the default. `null` when nothing with a section of its
 * own is open.
 */
export const setNavSectionSeed = createAction<NavSection | null>(
  SET_NAV_SECTION_SEED,
);

// `null` means "not chosen yet", so a deep link gets to decide its own section.
const navSection = handleActions<NavSection | null>(
  {
    [SET_NAV_SECTION]: {
      next: (_state, { payload }) => payload,
    },
  },
  null,
);

const navSectionSeed = handleActions<NavSection | null>(
  {
    [SET_NAV_SECTION_SEED]: {
      next: (_state, { payload }) => payload,
    },
  },
  null,
);

export const OPEN_NAV_ITEM = "metabase/app/OPEN_NAV_ITEM";
export const CLOSE_NAV_ITEM = "metabase/app/CLOSE_NAV_ITEM";

export const openNavItem = createAction<OpenNavItem>(OPEN_NAV_ITEM);
/** Takes the row out of the rail by its `key`; the entity itself is untouched. */
export const closeNavItem = createAction<string>(CLOSE_NAV_ITEM);

const openNavItems = handleActions<OpenNavItem[], any>(
  {
    [OPEN_NAV_ITEM]: {
      next: (state: OpenNavItem[], { payload }: { payload: OpenNavItem }) => {
        const index = state.findIndex((item) => item.key === payload.key);

        if (index === -1) {
          return [...state, payload];
        }

        // Reopening keeps its place in the list, but picks up a renamed entity.
        return state.map((item, i) => (i === index ? payload : item));
      },
    },
    [CLOSE_NAV_ITEM]: {
      next: (state: OpenNavItem[], { payload }: { payload: string }) =>
        state.filter((item) => item.key !== payload),
    },
  },
  [],
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
  pageCollection,
  pageBackground,
  errorPage,
  navSection,
  navSectionSeed,
  openNavItems,
  isDndAvailable: (initValue: unknown) => {
    if (typeof initValue === "boolean") {
      return initValue;
    }
    return true;
  },
  isErrorDiagnosticsOpen,
  tempStorage: tempStorageSlice.reducer,
});
