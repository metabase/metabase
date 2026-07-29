import { createAction } from "@reduxjs/toolkit";

import type { Dispatch } from "metabase/redux/store";
import { type Location, push } from "metabase/router";
import type {
  DashCardId,
  DashCardVisualizationSettings,
  Dashboard,
  DashboardCard,
  DashboardId,
} from "metabase-types/api";

export const SET_EDITING_DASHBOARD = "metabase/dashboard/SET_EDITING_DASHBOARD";
export const setEditingDashboard = (
  dashboard: Dashboard | null,
  location?: Omit<Location, "query" | "action">,
) => {
  return (dispatch: Dispatch) => {
    // Leaving edit mode drops any hash params from the URL. The caller passes the
    // current location, since this no longer reads the retired routing slice.
    //
    // Only navigate when there is actually a hash to strip. The location is
    // captured when the caller rendered, so pushing it unconditionally would
    // clobber query params written since then (e.g. the tab the dashboard URL
    // sync just selected, which it will not re-add because it dedupes on the
    // previous params). Push a path string rather than spreading the location:
    // it has no v3 `query` field, and the v3 history rebuilds `search` from
    // `query`, so spreading it would drop the query string entirely.
    if (dashboard === null && location?.hash) {
      dispatch(push(`${location.pathname}${location.search}`));
    }

    dispatch({
      type: SET_EDITING_DASHBOARD,
      payload: dashboard,
    });
  };
};

export const CANCEL_EDITING_DASHBOARD =
  "metabase/dashboard/CANCEL_EDITING_DASHBOARD";
export const cancelEditingDashboard =
  (location?: Omit<Location, "query" | "action">) => (dispatch: Dispatch) => {
    dispatch(setEditingDashboard(null, location));
    dispatch({ type: CANCEL_EDITING_DASHBOARD });
  };

export type SetDashboardAttributesOpts = {
  id: DashboardId;
  attributes: Partial<Dashboard>;
  isDirty?: boolean;
};
export const SET_DASHBOARD_ATTRIBUTES =
  "metabase/dashboard/SET_DASHBOARD_ATTRIBUTES";
export const setDashboardAttributes = createAction<SetDashboardAttributesOpts>(
  SET_DASHBOARD_ATTRIBUTES,
);

export type SetDashCardAttributesOpts = {
  id: DashCardId;
  attributes: Partial<DashboardCard>;
};
export const SET_DASHCARD_ATTRIBUTES =
  "metabase/dashboard/SET_DASHCARD_ATTRIBUTES";
export const setDashCardAttributes = createAction<SetDashCardAttributesOpts>(
  SET_DASHCARD_ATTRIBUTES,
);

export type SetMultipleDashCardAttributesOpts = SetDashCardAttributesOpts[];
export const SET_MULTIPLE_DASHCARD_ATTRIBUTES =
  "metabase/dashboard/SET_MULTIPLE_DASHCARD_ATTRIBUTES";
export const setMultipleDashCardAttributes = createAction<{
  dashcards: SetMultipleDashCardAttributesOpts;
}>(SET_MULTIPLE_DASHCARD_ATTRIBUTES);

export const ADD_CARD_TO_DASH = "metabase/dashboard/ADD_CARD_TO_DASH";
export const ADD_MANY_CARDS_TO_DASH =
  "metabase/dashboard/ADD_MANY_CARDS_TO_DASH";

export const REMOVE_CARD_FROM_DASH = "metabase/dashboard/REMOVE_CARD_FROM_DASH";

export const UNDO_REMOVE_CARD_FROM_DASH =
  "metabase/dashboard/UNDO_REMOVE_CARD_FROM_DASH";

export const TRASH_DASHBOARD_QUESTION_FROM_DASH =
  "metabase/dashboard/TRASH_DASHBOARD_QUESTION_FROM_DASH";

export const UNDO_TRASH_DASHBOARD_QUESTION_FROM_DASH =
  "metabase/dashboard/UNDO_TRASH_DASHBOARD_QUESTION_FROM_DASH";

export const UPDATE_DASHCARD_VISUALIZATION_SETTINGS =
  "metabase/dashboard/UPDATE_DASHCARD_VISUALIZATION_SETTINGS";
export const onUpdateDashCardVisualizationSettings = createAction(
  UPDATE_DASHCARD_VISUALIZATION_SETTINGS,
  (
    id: DashCardId,
    settings: DashCardVisualizationSettings | null | undefined,
  ) => ({
    payload: {
      id,
      settings,
    },
  }),
);

export const UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN =
  "metabase/dashboard/UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN";
export const onUpdateDashCardColumnSettings = createAction(
  UPDATE_DASHCARD_VISUALIZATION_SETTINGS_FOR_COLUMN,
  (
    id: DashCardId,
    column: string,
    settings?: Record<string, unknown> | null,
  ) => ({ payload: { id, column, settings } }),
);

export const REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS =
  "metabase/dashboard/REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS";
export const onReplaceAllDashCardVisualizationSettings = createAction(
  REPLACE_ALL_DASHCARD_VISUALIZATION_SETTINGS,
  (
    id: DashCardId,
    settings: DashCardVisualizationSettings | null | undefined,
  ) => ({
    payload: {
      id,
      settings,
    },
  }),
);
