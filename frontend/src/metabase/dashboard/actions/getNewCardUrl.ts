import _ from "underscore";

import type { StoreDashboard } from "metabase/redux/store";
import * as Urls from "metabase/utils/urls";
import { getCardAfterVisualizationClick } from "metabase/visualizations/lib/utils";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { ParameterWithTarget } from "metabase-lib/v1/parameters/types";
import { getTemplateTagFromTarget } from "metabase-lib/v1/parameters/utils/targets";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Card,
  Dashboard,
  ParameterId,
  ParameterValueOrArray,
  QuestionDashboardCard,
  TemplateTag,
  VirtualCard,
} from "metabase-types/api";

import { getStructuredQuestionUrlWithParameters } from "../utils/question-url";

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
  parameterValues: Record<
    ParameterId,
    ParameterValueOrArray | undefined | null
  >;
  nextCard: Card | VirtualCard;
  previousCard: Card | VirtualCard;
  dashcard: QuestionDashboardCard;
  objectId?: number | string;
}): string | undefined => {
  const cardAfterClick = getCardAfterVisualizationClick(nextCard, previousCard);

  const previousQuestion = new Question(previousCard, metadata);
  const { isEditable } = Lib.queryDisplayInfo(previousQuestion.query());
  const parametersMappedToCard = getParametersMappedToCard(
    dashboard.parameters,
    dashcard,
    previousCard,
  );

  let nextQuestion: Question | undefined = undefined;

  if (isEditable) {
    nextQuestion = new Question(cardAfterClick, metadata)
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
    const { isNative } = Lib.queryDisplayInfo(nextQuestion.query());
    if (isNative) {
      const nativeQuery = nextQuestion.legacyNativeQuery() as NativeQuery;
      return Urls.question(nextQuestion, {
        query: remapParameterValuesToTemplateTags(
          nativeQuery.templateTags(),
          parametersMappedToCard,
          parameterValues,
        ),
      });
    }

    return getStructuredQuestionUrlWithParameters(
      nextQuestion,
      previousQuestion,
      parametersMappedToCard,
      parameterValues,
      { objectId },
    );
  } catch (error) {
    return undefined;
  }
};

export function getParametersMappedToCard(
  parameters: Dashboard["parameters"],
  dashcard: QuestionDashboardCard,
  card: Card | VirtualCard,
): ParameterWithTarget[] {
  const { parameter_mappings } = dashcard;
  return (parameters || []).flatMap((parameter) => {
    const mapping = _.findWhere(parameter_mappings || [], {
      parameter_id: parameter.id,
      card_id: card.id,
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

// When navigating from a dashboard to a saved native question, dashboard parameters
// need to be remapped from dashboard-parameter-id keys to template-tag-name keys so
// the native editor populates its template tags from the URL query string.
export function remapParameterValuesToTemplateTags(
  templateTags: TemplateTag[],
  dashboardParameters: ParameterWithTarget[],
  parameterValuesByDashboardParameterId: Record<string, any>,
) {
  const parameterValues: Record<string, any> = {};
  const templateTagParametersByName = _.indexBy(templateTags, "name");

  dashboardParameters.forEach((dashboardParameter) => {
    const { target } = dashboardParameter;
    const tag = getTemplateTagFromTarget(target);

    if (tag != null && templateTagParametersByName[tag]) {
      const templateTagParameter = templateTagParametersByName[tag];
      const parameterValue =
        parameterValuesByDashboardParameterId[dashboardParameter.id];
      parameterValues[templateTagParameter.name] = parameterValue;
    }
  });

  return parameterValues;
}
