import { createThunkAction } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";

import { openUrl } from "metabase/redux/app";
import { getParametersMappedToDashcard } from "metabase/parameters/utils/dashboards";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";
import Question from "metabase-lib/Question";
import { getDashboardId } from "../selectors";

export const EDIT_QUESTION = "metabase/dashboard/EDIT_QUESTION";
export const editQuestion = createThunkAction(
  EDIT_QUESTION,
  question => (dispatch, getState) => {
    const dashboardId = getDashboardId(getState());
    const mode = question.isNative() ? "view" : "notebook";
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
    (dispatch, getState) => {
      const metadata = getMetadata(getState());
      const { dashboardId, dashboards, parameterValues } = getState().dashboard;
      const dashboard = dashboards[dashboardId];
      const cardAfterClick = getCardAfterVisualizationClick(
        nextCard,
        previousCard,
      );

      let question = new Question(cardAfterClick, metadata);
      if (question.query().isEditable()) {
        question = question
          .setDisplay(cardAfterClick.display || previousCard.display)
          .setSettings(dashcard.card.visualization_settings)
          .lockDisplay();
      } else {
        question = question.setCard(dashcard.card).setDashboardProps({
          dashboardId: dashboard.id,
          dashcardId: dashcard.id,
        });
      }

      const parametersMappedToCard = getParametersMappedToDashcard(
        dashboard,
        dashcard,
      );

      // When drilling from a native model, the drill can return a new question
      // querying a table for which we don't have any metadata for
      // When building a question URL, it'll usually clean the query and
      // strip clauses referencing fields from tables without metadata
      const previousQuestion = new Question(previousCard, metadata);
      const isDrillingFromNativeModel =
        previousQuestion.isDataset() && previousQuestion.isNative();

      const url = question.getUrlWithParameters(
        parametersMappedToCard,
        parameterValues,
        {
          clean: !isDrillingFromNativeModel,
          objectId,
        },
      );

      dispatch(openUrl(url));
      return { dashboardId };
    },
);
