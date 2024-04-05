import _ from "underscore";

import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { ParameterWithTarget } from "metabase-lib/v1/parameters/types";
import * as ML_Urls from "metabase-lib/v1/urls";
import type {
  Card,
  Dashboard,
  QuestionDashboardCard,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

export const getNewCardUrl = (
  metadata: Metadata,
  dashboardState: State["dashboard"],
  {
    nextCard,
    previousCard,
    dashcard,
    objectId,
  }: {
    nextCard: Card;
    previousCard: Card;
    dashcard: QuestionDashboardCard;
    objectId: number | string;
  },
): string | null => {
  const { dashboardId, dashboards, parameterValues } = dashboardState;

  if (dashboardId === null) {
    return null;
  }

  const dashboard = dashboards[dashboardId];
  const cardAfterClick = getCardAfterVisualizationClick(nextCard, previousCard);

  let question = new Question(cardAfterClick, metadata);
  const { isEditable } = Lib.queryDisplayInfo(question.query());
  if (isEditable) {
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
    dashboard.parameters,
    dashcard,
  );

  // When drilling from a native model, the drill can return a new question
  // querying a table for which we don't have any metadata for
  // When building a question URL, it'll usually clean the query and
  // strip clauses referencing fields from tables without metadata
  const previousQuestion = new Question(previousCard, metadata);
  const { isNative: isPreviousNative } = Lib.queryDisplayInfo(
    previousQuestion.query(),
  );

  const isDrillingFromNativeModel =
    previousQuestion.type() === "model" && isPreviousNative;

  const url = ML_Urls.getUrlWithParameters(
    question,
    parametersMappedToCard,
    parameterValues,
    {
      clean: !isDrillingFromNativeModel,
      objectId,
    },
  );

  return url;
};

export function getParametersMappedToDashcard(
  parameters: Dashboard["parameters"],
  dashcard: QuestionDashboardCard,
): ParameterWithTarget[] {
  const { parameter_mappings } = dashcard;
  return (parameters || [])
    .map(parameter => {
      const mapping = _.findWhere(parameter_mappings || [], {
        parameter_id: parameter.id,
      });

      if (mapping) {
        return {
          ...parameter,
          target: mapping.target,
        };
      }
    })
    .filter((parameter): parameter is ParameterWithTarget => parameter != null);
}
