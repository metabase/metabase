import { createThunkAction } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { openUrl } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Card, DashboardCard, VirtualCard } from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";

import { isQuestionDashCard } from "../utils";

import { getNewCardUrl } from "./getNewCardUrl";

export const EDIT_QUESTION = "metabase/dashboard/EDIT_QUESTION";

export const editQuestion = createThunkAction(
  EDIT_QUESTION,
  (question: Question, mode = "notebook") =>
    (dispatch: Dispatch, getState: GetState) => {
      const state = getState();
      const { dashboardId, dashboards } = state.dashboard;
      const dashboard = dashboardId != null ? dashboards[dashboardId] : null;
      const { isNative } = Lib.queryDisplayInfo(question.query());
      const finalMode = isNative ? "view" : mode;
      const url = Urls.question(question.card(), { mode: finalMode });

      dispatch(openUrl(url));
      return { id: dashboardId, name: dashboard?.name, model: "dashboard" };
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
type NavigateToNewCardFromDashboardArgs = {
  nextCard: Card | VirtualCard;
  previousCard: Card | VirtualCard;
  dashcard: DashboardCard;
  objectId?: number | string;
};

export const navigateToNewCardFromDashboard = createThunkAction(
  NAVIGATE_TO_NEW_CARD,
  ({
    nextCard,
    previousCard,
    dashcard,
    objectId,
  }: NavigateToNewCardFromDashboardArgs) =>
    (dispatch: Dispatch, getState: GetState) => {
      const state = getState();
      const metadata = getMetadata(state);
      const { dashboardId, dashboards, parameterValues } = state.dashboard;
      const dashboard = dashboardId != null ? dashboards[dashboardId] : null;

      if (dashboard && isQuestionDashCard(dashcard)) {
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
      }

      return { model: "dashboard", id: dashboardId, name: dashboard?.name };
    },
);
