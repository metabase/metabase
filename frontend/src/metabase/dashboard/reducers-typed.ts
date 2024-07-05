import { createReducer } from "@reduxjs/toolkit";

import { handleActions } from "metabase/lib/redux";
import { NAVIGATE_BACK_TO_DASHBOARD } from "metabase/query_builder/actions";

import {
  INITIALIZE,
  SET_EDITING_DASHBOARD,
  SHOW_ADD_PARAMETER_POPOVER,
  HIDE_ADD_PARAMETER_POPOVER,
  RESET,
  SHOW_AUTO_APPLY_FILTERS_TOAST,
  fetchDashboard,
  setDisplayTheme,
  markCardAsSlow,
  setDocumentTitle,
  setShowLoadingCompleteFavicon,
  REMOVE_PARAMETER,
  CLOSE_SIDEBAR,
  setSidebar,
} from "./actions";
import { INITIAL_DASHBOARD_STATE } from "./constants";

export const dashboardId = createReducer(
  INITIAL_DASHBOARD_STATE.dashboardId,
  builder => {
    builder.addCase(INITIALIZE, _state => null);
    builder.addCase(
      fetchDashboard.fulfilled,
      (_state, { payload }) => payload.dashboardId,
    );
    builder.addCase(RESET, _state => null);
  },
);

// TODO: double check if this reducer is used
export const missingActionParameters = handleActions(
  {
    [INITIALIZE]: {
      next: () => null,
    },
    [RESET]: {
      next: () => null,
    },
  },
  INITIAL_DASHBOARD_STATE.missingActionParameters,
);

export const autoApplyFilters = createReducer(
  INITIAL_DASHBOARD_STATE.autoApplyFilters,
  builder => {
    builder.addCase<
      string,
      {
        type: string;
        payload: { toastId: number | null; dashboardId: number | null };
      }
    >(SHOW_AUTO_APPLY_FILTERS_TOAST, (state, { payload }) => {
      const { toastId, dashboardId } = payload;

      state.toastId = toastId;
      state.toastDashboardId = dashboardId;
    });
  },
);

export const theme = createReducer(INITIAL_DASHBOARD_STATE.theme, builder => {
  builder.addCase(setDisplayTheme, (_state, { payload }) => payload || null);
});

export const slowCards = createReducer(
  INITIAL_DASHBOARD_STATE.slowCards,
  builder => {
    builder.addCase(markCardAsSlow, (state, { payload: { id, result } }) => ({
      ...state,
      [id]: result,
    }));
  },
);

export const isNavigatingBackToDashboard = handleActions(
  {
    [NAVIGATE_BACK_TO_DASHBOARD]: () => true,
    [RESET]: () => false,
  },
  INITIAL_DASHBOARD_STATE.isNavigatingBackToDashboard,
);

export const isAddParameterPopoverOpen = handleActions(
  {
    [SHOW_ADD_PARAMETER_POPOVER]: () => true,
    [HIDE_ADD_PARAMETER_POPOVER]: () => false,
    [INITIALIZE]: () => false,
    [RESET]: () => false,
  },
  INITIAL_DASHBOARD_STATE.isAddParameterPopoverOpen,
);

export const editingDashboard = handleActions(
  {
    [INITIALIZE]: { next: () => INITIAL_DASHBOARD_STATE.editingDashboard },
    [SET_EDITING_DASHBOARD]: {
      next: (_state, { payload }) => payload ?? null,
    },
    [RESET]: { next: () => INITIAL_DASHBOARD_STATE.editingDashboard },
  },
  INITIAL_DASHBOARD_STATE.editingDashboard,
);

export const loadingControls = createReducer(
  INITIAL_DASHBOARD_STATE.loadingControls,
  builder => {
    builder.addCase(setDocumentTitle, (state, { payload }) => {
      state.documentTitle = payload;
    });

    builder.addCase(setShowLoadingCompleteFavicon, (state, { payload }) => {
      state.showLoadCompleteFavicon = payload;
    });

    builder.addCase(RESET, () => INITIAL_DASHBOARD_STATE.loadingControls);
  },
);

const DEFAULT_SIDEBAR = { props: {} };
export const sidebar = createReducer(
  INITIAL_DASHBOARD_STATE.sidebar,
  builder => {
    builder.addCase(INITIALIZE, () => DEFAULT_SIDEBAR);
    builder.addCase(RESET, () => DEFAULT_SIDEBAR);
    builder.addCase(REMOVE_PARAMETER, () => DEFAULT_SIDEBAR);
    builder.addCase(SET_EDITING_DASHBOARD, () => DEFAULT_SIDEBAR);
    builder.addCase(CLOSE_SIDEBAR, () => DEFAULT_SIDEBAR);

    builder.addCase(setSidebar, (_state, { payload: { name, props } }) => ({
      name,
      props: props || {},
    }));
  },
);
