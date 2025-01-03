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
  VirtualCard,
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
  dashboard: Dashboard | StoreDashboard;
  parameterValues: Record<ParameterId, ParameterValueOrArray>;
  nextCard: Card | VirtualCard;
  previousCard: Card | VirtualCard;
  dashcard: QuestionDashboardCard;
  objectId?: number | string;
}): string | undefined => {
  const cardAfterClick = getCardAfterVisualizationClick(nextCard, previousCard);

  const previousQuestion = new Question(previousCard, metadata);
  const { isEditable } = Lib.queryDisplayInfo(previousQuestion.query());
  const parametersMappedToCard = getParametersMappedToDashcard(
    dashboard.parameters,
    dashcard,
  );

  let nextQuestion: Question | undefined = undefined;

  if (isEditable) {
    nextQuestion = new Question(cardAfterClick, metadata);

    // Pivot tables cannot work when there is an extra stage added on top of breakouts and aggregations
    if (nextQuestion.display() !== "pivot") {
      nextQuestion = nextQuestion.setQuery(
        Lib.ensureFilterStage(nextQuestion.query()),
      );
    }

    nextQuestion = nextQuestion
      .setDisplay(cardAfterClick.display || previousCard.display)
      .setSettings(dashcard.card.visualization_settings)
      .lockDisplay();
  } else {
    nextQuestion = new Question(dashcard.card, metadata).setDashboardProps({
      dashboardId: dashboard.id,
      dashcardId: dashcard.id,
    });
  }

  // This try/catch block is a temporary workaround for metabase#43990.
  // Please remove it once the underlying issue is fixed.
  try {
    const url = ML_Urls.getUrlWithParameters(
      nextQuestion,
      previousQuestion,
      parametersMappedToCard,
      parameterValues,
      {
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
  return (parameters || []).flatMap(parameter => {
    const mapping = _.findWhere(parameter_mappings || [], {
      parameter_id: parameter.id,
    });

    if (!mapping) {
      return [];
    }

    return [
      {
        ...parameter,
        target: mapping.target,
      },
    ];
  });
}
