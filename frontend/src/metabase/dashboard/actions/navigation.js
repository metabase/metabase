import { createThunkAction } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { openUrl } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";

import { getDashboardId } from "../selectors";

import { getNewCardUrl } from "./getNewCardUrl";

export const EDIT_QUESTION = "metabase/dashboard/EDIT_QUESTION";
export const editQuestion = createThunkAction(
  EDIT_QUESTION,
  question => (dispatch, getState) => {
    const dashboardId = getDashboardId(getState());
    const { isNative } = Lib.queryDisplayInfo(question.query());
    const mode = isNative ? "view" : "notebook";
    const url = Urls.question(question.card(), { mode });

    dispatch(openUrl(url));
    return { dashboardId };
  },
);

/**
 * All navigation actions from dashboards to cards (e.x. clicking a title, drill through)
 * should go through this action, which merges any currently applied dashboard filters
 * into the new card / URL parameters.
 *
 * User-triggered events that are handled here:
 *     - clicking a dashcard legend:
 *         * question title legend (only for single-question cards)
 *         * series legend (multi-aggregation, multi-breakout, multiple questions)
 *     - clicking the visualization inside dashcard
 *         * drill-through (single series, multi-aggregation, multi-breakout, multiple questions)
 *         * (not in 0.24.2 yet: drag on line/area/bar visualization)
 *     - those all can be applied without or with a dashboard filter
 */
export const NAVIGATE_TO_NEW_CARD = "metabase/dashboard/NAVIGATE_TO_NEW_CARD";
export const navigateToNewCardFromDashboard = createThunkAction(
  NAVIGATE_TO_NEW_CARD,
  ({ nextCard, previousCard, dashcard, objectId }) =>
    async (dispatch, getState) => {
      const state = getState();
      const { dashboardId, dashboards, parameterValues } = state.dashboard;
      const dashboard = dashboardId ? dashboards[dashboardId] : undefined;
      const metadata = getMetadata(state);
      const url = getNewCardUrl({
        metadata,
        dashboard,
        parameterValues,
        nextCard,
        previousCard,
        dashcard,
        objectId,
      });

      if (url) {
        dispatch(openUrl(url));
      }

      return { dashboardId };
    },
);
