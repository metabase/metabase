import { selectQuestionFromCardBuilder } from "metabase/metadata-store";
import { createThunkAction } from "metabase/redux";
import { openUrl } from "metabase/redux/app";
import { EDIT_QUESTION, NAVIGATE_TO_NEW_CARD } from "metabase/redux/dashboard";
import type { Dispatch, GetState, State } from "metabase/redux/store";
import * as Urls from "metabase/urls";
import { isQuestionDashCard } from "metabase/utils/dashboard";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Card, DashboardCard, SeriesCard } from "metabase-types/api";

import { getNewCardUrl } from "./getNewCardUrl";

export const editQuestion = createThunkAction(
  EDIT_QUESTION,
  (question: Question, mode: "view" | "notebook" | "query" = "notebook") =>
    (dispatch: Dispatch, getState: GetState) => {
      const state = getState();
      const { dashboardId, dashboards } = state.dashboard;
      const dashboard = dashboardId != null ? dashboards[dashboardId] : null;
      const { isNative } = Lib.queryDisplayInfo(question.query());
      const finalMode = isNative ? "view" : mode;
      const url = Urls.card(question.card(), { mode: finalMode });

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
type NavigateToNewCardFromDashboardArgs = {
  nextCard: SeriesCard;
  previousCard: Card;
  dashcard: DashboardCard;
  objectId?: number | string;
};

/**
 * Returns the URL `navigateToNewCardFromDashboard` opens for the same arguments,
 * or `undefined` when there is no dashboard or the dashcard has no question.
 */
export const getNewCardUrlFromDashboard = (
  state: State,
  {
    nextCard,
    previousCard,
    dashcard,
    objectId,
  }: NavigateToNewCardFromDashboardArgs,
): string | undefined => {
  const { dashboardId, dashboards, parameterValues } = state.dashboard;
  const dashboard = dashboardId != null ? dashboards[dashboardId] : null;

  if (
    !dashboard ||
    !isQuestionDashCard(dashcard) ||
    !dashcard.card.dataset_query
  ) {
    return undefined;
  }

  return getNewCardUrl({
    buildQuestion: selectQuestionFromCardBuilder(state),
    dashboard,
    parameterValues,
    nextCard,
    previousCard,
    dashcard,
    objectId,
  });
};

export const navigateToNewCardFromDashboard = createThunkAction(
  NAVIGATE_TO_NEW_CARD,
  (args: NavigateToNewCardFromDashboardArgs) =>
    (dispatch: Dispatch, getState: GetState) => {
      const state = getState();
      const { dashboardId, dashboards } = state.dashboard;
      const dashboard = dashboardId != null ? dashboards[dashboardId] : null;

      const url = getNewCardUrlFromDashboard(state, args);
      if (url) {
        dispatch(openUrl(url));
      }

      return { model: "dashboard", id: dashboardId, name: dashboard?.name };
    },
);
