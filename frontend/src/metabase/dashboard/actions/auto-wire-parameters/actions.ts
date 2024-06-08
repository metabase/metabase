import {
  closeAutoWireParameterToast,
  showAddedCardAutoWireParametersToast,
  showAutoWireParametersToast,
} from "metabase/dashboard/actions/auto-wire-parameters/toasts";
import {
  getAllDashboardCardsWithUnmappedParameters,
  getAutoWiredMappingsForDashcards,
  getMatchingParameterOption,
  getParameterMappings,
} from "metabase/dashboard/actions/auto-wire-parameters/utils";
import { getExistingDashCards } from "metabase/dashboard/actions/utils";
import { getMappingOptionByTarget } from "metabase/dashboard/components/DashCard/utils";
import {
  getDashCardById,
  getParameters,
  getQuestions,
  getDashboard,
  getSelectedTabId,
  getTabs,
} from "metabase/dashboard/selectors";
import { isQuestionDashCard } from "metabase/dashboard/utils";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import type {
  QuestionDashboardCard,
  DashCardId,
  ParameterId,
  ParameterTarget,
  DashboardTabId,
  DashboardParameterMapping,
} from "metabase-types/api";
import type { Dispatch, GetState, StoreDashcard } from "metabase-types/store";

export function showAutoWireToast(
  parameter_id: ParameterId,
  dashcard: QuestionDashboardCard,
  target: ParameterTarget,
  selectedTabId: DashboardTabId,
) {
  return function (dispatch: Dispatch, getState: GetState) {
    const dashboardState = getState().dashboard;
    const questions = getQuestions(getState());
    const parameter = getParameters(getState()).find(
      ({ id }) => id === parameter_id,
    );

    if (!dashboardState.dashboardId || !parameter) {
      return;
    }

    const dashcardsToAutoApply = getAllDashboardCardsWithUnmappedParameters({
      dashboards: dashboardState.dashboards,
      dashcards: dashboardState.dashcards,
      dashboardId: dashboardState.dashboardId,
      parameterId: parameter_id,
      selectedTabId,
      // exclude current dashcard as it's being updated in another action
      excludeDashcardIds: [dashcard.id],
    });

    const dashcardAttributes = getAutoWiredMappingsForDashcards(
      parameter,
      dashcardsToAutoApply,
      target,
      questions,
    );

    const shouldShowToast = dashcardAttributes.length > 0;

    if (!shouldShowToast) {
      return;
    }

    const originalDashcardAttributes = dashcardsToAutoApply.map(dashcard => ({
      id: dashcard.id,
      attributes: {
        parameter_mappings: dashcard.parameter_mappings,
      },
    }));

    const mappingOption = getMatchingParameterOption(
      parameter,
      dashcard,
      target,
      questions,
    );

    const tabs = getTabs(getState());

    if (!mappingOption) {
      return;
    }

    dispatch(
      showAutoWireParametersToast({
        dashcardAttributes,
        originalDashcardAttributes,
        columnName: formatMappingOption(mappingOption),
        hasMultipleTabs: tabs.length > 1,
      }),
    );
  };
}

export function showAutoWireToastNewCard({
  dashcard_id,
}: {
  dashcard_id: DashCardId;
}) {
  return function (dispatch: Dispatch, getState: GetState) {
    dispatch(closeAutoWireParameterToast());

    const dashboardState = getState().dashboard;
    const dashboardId = dashboardState.dashboardId;

    if (!dashboardId) {
      return;
    }

    const dashboard = getDashboard(getState());
    if (!dashboard || !dashboard.parameters) {
      return;
    }

    const questions = getQuestions(getState());
    const parameters = getParameters(getState());
    const selectedTabId = getSelectedTabId(getState());

    const dashcards = getExistingDashCards(
      dashboardState.dashboards,
      dashboardState.dashcards,
      dashboardId,
      selectedTabId,
    );

    const targetDashcard: StoreDashcard = getDashCardById(
      getState(),
      dashcard_id,
    );

    if (!targetDashcard || !isQuestionDashCard(targetDashcard)) {
      return;
    }

    const targetQuestion = questions[targetDashcard.card.id];

    const parametersMappingsToApply: DashboardParameterMapping[] = [];
    const processedParameterIds = new Set();

    for (const parameter of parameters) {
      const dashcardMappingOptions = getParameterMappingOptions(
        targetQuestion,
        parameter,
        targetDashcard.card,
        targetDashcard,
      );

      for (const dashcard of dashcards) {
        for (const mapping of dashcard.parameter_mappings ?? []) {
          const option = getMappingOptionByTarget(
            dashcardMappingOptions,
            targetDashcard,
            mapping.target,
            targetQuestion,
            parameter,
          );

          if (
            option &&
            targetDashcard.card_id &&
            !processedParameterIds.has(parameter.id)
          ) {
            parametersMappingsToApply.push(
              ...getParameterMappings(
                targetDashcard,
                parameter.id,
                targetDashcard.card_id,
                option.target,
              ),
            );
            processedParameterIds.add(parameter.id);
          }
        }
      }
    }

    if (parametersMappingsToApply.length === 0) {
      return;
    }

    const parametersToMap = dashboard.parameters.filter(p =>
      processedParameterIds.has(p.id),
    );

    dispatch(
      showAddedCardAutoWireParametersToast({
        targetDashcard,
        dashcard_id,
        parametersMappingsToApply,
        parametersToMap,
      }),
    );
  };
}

function formatMappingOption({
  name,
  sectionName,
}: {
  name: string;
  sectionName?: string;
}) {
  if (sectionName == null) {
    // for native question variables or field literals we just display the name
    return name;
  }
  return `${sectionName}.${name}`;
}
