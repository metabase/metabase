import { createThunkAction } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getParametersMappedToDashcard } from "metabase/parameters/utils/dashboards";
import { openUrl } from "metabase/redux/app";
import { getMetadata } from "metabase/selectors/metadata";
import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import * as ML_Urls from "metabase-lib/v1/urls";

import { getDashboardId } from "../selectors";

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
    (dispatch, getState) => {
      const metadata = getMetadata(getState());
      const { dashboardId, dashboards, parameterValues } = getState().dashboard;
      const dashboard = dashboards[dashboardId];
      const cardAfterClick = getCardAfterVisualizationClick(
        nextCard,
        previousCard,
      );

      const previousQuestion = new Question(previousCard, metadata);
      const { isEditable } = Lib.queryDisplayInfo(previousQuestion.query());
      const nextQuestion = isEditable
        ? new Question(cardAfterClick, metadata)
            .setDisplay(cardAfterClick.display || previousCard.display)
            .setSettings(dashcard.card.visualization_settings)
            .lockDisplay()
        : new Question(dashcard.card, metadata).setDashboardProps({
            dashboardId: dashboard.id,
            dashcardId: dashcard.id,
          });

      const parametersMappedToCard = getParametersMappedToDashcard(
        dashboard,
        dashcard,
      );

      const url = ML_Urls.getUrlWithParameters(
        nextQuestion,
        parametersMappedToCard,
        parameterValues,
        {
          objectId,
        },
      );

      dispatch(openUrl(url));
      return { dashboardId };
    },
);
