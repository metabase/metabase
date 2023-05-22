import { createAction, createThunkAction } from "metabase/lib/redux";
import { getIsNavigatingWithinDashboard } from "metabase/dashboard/selectors";

export const INITIALIZE = "metabase/dashboard/INITIALIZE";
export const initialize = createThunkAction(
  INITIALIZE,
  () => (dispatch, getState) => {
    return {
      isNavigatingWithinDashboard: getIsNavigatingWithinDashboard(getState()),
    };
  },
);

export const RESET = "metabase/dashboard/RESET";
export const reset = createThunkAction(RESET, () => (dispatch, getState) => {
  return {
    isNavigatingWithinDashboard: getIsNavigatingWithinDashboard(getState()),
  };
});

export const SET_EDITING_DASHBOARD = "metabase/dashboard/SET_EDITING_DASHBOARD";
export const setEditingDashboard = createAction(SET_EDITING_DASHBOARD);

export const SET_DASHBOARD_ATTRIBUTES =
  "metabase/dashboard/SET_DASHBOARD_ATTRIBUTES";
export const setDashboardAttributes = createAction(SET_DASHBOARD_ATTRIBUTES);

export const SET_DASHCARD_ATTRIBUTES =
  "metabase/dashboard/SET_DASHCARD_ATTRIBUTES";
export const setDashCardAttributes = createAction(SET_DASHCARD_ATTRIBUTES);

export const SET_MULTIPLE_DASHCARD_ATTRIBUTES =
  "metabase/dashboard/SET_MULTIPLE_DASHCARD_ATTRIBUTES";
export const setMultipleDashCardAttributes = createAction(
  SET_MULTIPLE_DASHCARD_ATTRIBUTES,
);

export const ADD_CARD_TO_DASH = "metabase/dashboard/ADD_CARD_TO_DASH";

export const REMOVE_CARD_FROM_DASH = "metabase/dashboard/REMOVE_CARD_FROM_DASH";
export const removeCardFromDashboard = createAction(REMOVE_CARD_FROM_DASH);

export const UNDO_REMOVE_CARD_FROM_DASH =
  "metabase/dashboard/UNDO_REMOVE_CARD_FROM_DASH";
export const undoRemoveCardFromDashboard = createAction(
  UNDO_REMOVE_CARD_FROM_DASH,
);

export const UPDATE_DASHCARD_VISUALIZATION_SETTINGS =
  "metabase/dashboard/UPDATE_DASHCARD_VISUALIZATION_SETTINGS";
export const onUpdateDashCardVisualizationSettings = createAction(
  UPDATE_DASHCARD_VISUALIZATION_SETTINGS,
  (id, settings) => ({ id, settings }),
);

export const UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN =
  "metabase/dashboard/UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN";
export const onUpdateDashCardColumnSettings = createAction(
  UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN,
  (id, column, settings) => ({ id, column, settings }),
);

export const REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS =
  "metabase/dashboard/REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS";
export const onReplaceAllDashCardVisualizationSettings = createAction(
  REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS,
  (id, settings) => ({ id, settings }),
);
