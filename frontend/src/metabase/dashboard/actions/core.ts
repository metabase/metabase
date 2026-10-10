import { createAction } from "@reduxjs/toolkit";

import { getDataStudioReturnPath } from "metabase/common/data-studio/utils/return-to";
import type { Dispatch, GetState } from "metabase/redux/store";
import { type Location, navigate } from "metabase/router";
import type {
  DashCardId,
  DashCardVisualizationSettings,
  Dashboard,
  DashboardCard,
  DashboardId,
} from "metabase-types/api";

import { getIsEditing } from "../shell-selectors";
import type { NewDashboardCard } from "../utils";

import type { fetchDashboard } from "./data-fetching";

export const SET_EDITING_DASHBOARD = "metabase/dashboard/SET_EDITING_DASHBOARD";
export const setEditingDashboard = (
  dashboard: Dashboard | null,
  location?: Omit<Location, "query" | "action">,
) => {
  return (dispatch: Dispatch, getState: GetState) => {
    // Save leaves edit mode twice, in the thunk and then in the button, so only
    // the call made while still editing navigates
    const isLeavingEditMode = dashboard === null && getIsEditing(getState());
    const returnPath = isLeavingEditMode
      ? getDataStudioReturnPath(location?.state)
      : undefined;

    // Leaving edit mode drops hash params from the URL. The location is captured
    // when the caller rendered, so navigating with no hash to strip would
    // clobber query params written since then (e.g. the tab the dashboard URL
    // sync just selected, which it will not re-add because it dedupes on the
    // previous params).
    if (isLeavingEditMode && returnPath == null && location?.hash) {
      navigate(`${location.pathname}${location.search}`);
    }

    dispatch({
      type: SET_EDITING_DASHBOARD,
      payload: dashboard,
    });

    // After the dispatch, so the unsaved-changes guard lets the return through
    if (returnPath != null) {
      navigate(returnPath, { replace: true });
    }
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

// Declared beside their type constants rather than next to the thunks that
// dispatch them. `reducers.ts` needs the creators, and the thunk modules reach
// the visualization and parameter stacks, which would then be in the initial
// bundle because the store imports the reducer on every page.
export const addCardToDash = createAction<NewDashboardCard>(ADD_CARD_TO_DASH);
export const addManyCardsToDash = createAction<NewDashboardCard[]>(
  ADD_MANY_CARDS_TO_DASH,
);

export const MARK_NEW_CARD_SEEN = "metabase/dashboard/MARK_NEW_CARD_SEEN";
export const markNewCardSeen = createAction<DashCardId>(MARK_NEW_CARD_SEEN);

// The parameter action types live here rather than in `actions/parameters`, for
// the same reason as the card ones above: `reducers.ts` names them, and that
// module reaches the parameter editing UI.
export const REMOVE_PARAMETER = "metabase/dashboard/REMOVE_PARAMETER";
export const SET_PARAMETER_VALUE = "metabase/dashboard/SET_PARAMETER_VALUE";
export const RESET_PARAMETERS = "metabase/dashboard/RESET_PARAMETERS";

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

/**
 * The fulfilled action of the `fetchDashboard` thunk.
 *
 * `reducers.ts` only matches on it, and matching is by type string, so it does
 * not need the thunk itself. Declaring it here keeps the store away from
 * `actions/data-fetching`, which reaches the whole dashboard data layer. The
 * payload type is derived from the thunk, so the two cannot drift.
 */
export const FETCH_DASHBOARD_FULFILLED =
  "metabase/dashboard/FETCH_DASHBOARD/fulfilled";

export const fetchDashboardFulfilled = createAction<
  ReturnType<typeof fetchDashboard.fulfilled>["payload"]
>(FETCH_DASHBOARD_FULFILLED);

/**
 * Dispatched by `fetchDashboard` as soon as the dashboard definition arrives,
 * before the slower query-metadata request finishes. It carries the same
 * normalized entities the fulfilled action will, so the loading skeleton can
 * draw the dashboard's real card layout without waiting for the full load.
 */
export const dashboardLayoutFetched = createAction<
  ReturnType<typeof fetchDashboard.fulfilled>["payload"]["entities"]
>("metabase/dashboard/DASHBOARD_LAYOUT_FETCHED");
