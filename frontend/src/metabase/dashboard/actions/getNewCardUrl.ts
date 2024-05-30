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
  ParameterId,
  ParameterValueOrArray,
  QuestionDashboardCard,
} from "metabase-types/api";
import type { StoreDashboard } from "metabase-types/store";

/**
 * All navigation URLs from dashboards to cards (e.x. clicking a title, drill through)
 * should come from this function, which merges any currently applied dashboard filters
 * into the new card / URL parameters.
 */
export const getNewCardUrl = ({
  metadata,
  dashboard,
  parameterValues,
  nextCard,
  previousCard,
  dashcard,
  objectId,
}: {
  metadata: Metadata;
  dashboard: Dashboard | StoreDashboard | undefined;
  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  nextCard: Card;
  previousCard: Card;
  dashcard: QuestionDashboardCard;
  objectId?: number | string;
}): string | undefined => {
  if (!dashboard) {
    return undefined;
  }

  const cardAfterClick = getCardAfterVisualizationClick(nextCard, previousCard);

  if (!cardAfterClick.dataset_query) {
    // If there's no query, then we don't have permissions for it
    // It would be invalid to generate URL for such card
    return undefined;
  }

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

  const isFromModelOrMetric =
    previousQuestion.type() === "model" || previousQuestion.type() === "metric";
  const isDrillingFromNativeModelOrMetric =
    isFromModelOrMetric && isPreviousNative;

  // This try/catch block is a temporary workaround for metabase#42999.
  // Without it, the "should work when set through the filter widget" test in
  // "dashboard-filters-text-category.cy.spec.js" will fail for multi-value filters.
  // Remove it once metabase#42999 is fixed.
  try {
    const url = ML_Urls.getUrlWithParameters(
      question,
      parametersMappedToCard,
      parameterValues,
      {
        clean: !isDrillingFromNativeModelOrMetric,
        objectId,
      },
    );

    return url;
  } catch (error) {
    return undefined;
  }
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
