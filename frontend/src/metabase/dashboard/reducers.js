import { assoc, dissoc } from "icepick";
import reduceReducers from "reduce-reducers";

import { combineReducers, handleActions } from "metabase/lib/redux";

import {
  INITIALIZE,
  REMOVE_PARAMETER,
  RESET_PARAMETERS,
  SET_PARAMETER_VALUE,
  SET_PARAMETER_VALUES,
  fetchDashboard,
  tabsReducer,
} from "./actions";
import { INITIAL_DASHBOARD_STATE } from "./constants";
import {
  autoApplyFilters,
  dashboardId,
  dashboards,
  dashcardData,
  dashcards,
  editingDashboard,
  isAddParameterPopoverOpen,
  isNavigatingBackToDashboard,
  loadingControls,
  loadingDashCards,
  missingActionParameters,
  parameterValues,
  sidebar,
  slowCards,
  theme,
} from "./reducers-typed";

const draftParameterValues = handleActions(
  {
    [INITIALIZE]: {
      next: (state, { payload: { clearCache = true } = {} }) => {
        return clearCache ? {} : state;
      },
    },
    [fetchDashboard.fulfilled]: {
      next: (
        state,
        { payload: { dashboard, parameterValues, preserveParameters } },
      ) =>
        preserveParameters && !dashboard.auto_apply_filters
          ? state
          : parameterValues,
    },
    [SET_PARAMETER_VALUE]: {
      next: (state, { payload: { id, value } }) =>
        assoc(state ?? {}, id, value),
    },
    [SET_PARAMETER_VALUES]: {
      next: (state, { payload }) => payload,
    },
    [RESET_PARAMETERS]: {
      next: (state, { payload: parameters }) => {
        return parameters.reduce(
          (result, parameter) => assoc(result, parameter.id, parameter.value),
          state ?? {},
        );
      },
    },
    [REMOVE_PARAMETER]: {
      next: (state, { payload: { id } }) => dissoc(state, id),
    },
  },
  {},
);

export const dashboardReducers = reduceReducers(
  INITIAL_DASHBOARD_STATE,
  combineReducers({
    dashboardId,
    missingActionParameters,
    autoApplyFilters,
    theme,
    slowCards,
    isNavigatingBackToDashboard,
    isAddParameterPopoverOpen,
    editingDashboard,
    loadingControls,
    sidebar,
    parameterValues,
    dashboards,
    loadingDashCards,
    dashcards,
    draftParameterValues,
    dashcardData,
    // Combined reducer needs to init state for every slice
    selectedTabId: (state = INITIAL_DASHBOARD_STATE.selectedTabId) => state,
    tabDeletions: (state = INITIAL_DASHBOARD_STATE.tabDeletions) => state,
  }),
  tabsReducer,
);
