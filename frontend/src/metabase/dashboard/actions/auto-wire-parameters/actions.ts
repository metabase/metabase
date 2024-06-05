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
  getDashboard,
  getDashCardById,
  getQuestions,
  getSelectedTabId,
  getTabs,
} from "metabase/dashboard/selectors";
import { isQuestionDashCard } from "metabase/dashboard/utils";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
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

    if (!dashboardState.dashboardId) {
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
      dashcardsToAutoApply,
      parameter_id,
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
        fieldName: formatMappingOption(mappingOption),
        multipleTabs: tabs.length > 1,
      }),
    );
  };
}

export function autoWireParametersToNewCard({
  dashcard_id,
}: {
  dashcard_id: DashCardId;
}) {
  return function (dispatch: Dispatch, getState: GetState) {
    dispatch(closeAutoWireParameterToast());

    const metadata = getMetadata(getState());
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

    // TODO: Drop new Question?
    const targetQuestion =
      questions[targetDashcard.card.id] ??
      new Question(targetDashcard.card, metadata);

    const dashcardMappingOptions = getParameterMappingOptions(
      targetQuestion,
      null,
      targetDashcard.card,
      targetDashcard,
    );

    const parametersToAutoApply: DashboardParameterMapping[] = [];
    const processedParameterIds = new Set();

    for (const dashcard of dashcards) {
      for (const mapping of dashcard.parameter_mappings ?? []) {
        const option = getMappingOptionByTarget(
          dashcardMappingOptions,
          targetDashcard,
          mapping.target,
          targetQuestion,
        );

        if (
          option &&
          targetDashcard.card_id &&
          !processedParameterIds.has(mapping.parameter_id)
        ) {
          parametersToAutoApply.push(
            ...(getParameterMappings(
              targetDashcard,
              mapping.parameter_id,
              targetDashcard.card_id,
              option.target,
            ) as DashboardParameterMapping[]),
          );
          processedParameterIds.add(mapping.parameter_id);
        }
      }
    }

    if (parametersToAutoApply.length === 0) {
      return;
    }

    const parameters = dashboard.parameters.filter(p =>
      processedParameterIds.has(p.id),
    );

    dispatch(
      showAddedCardAutoWireParametersToast({
        targetDashcard,
        dashcard_id,
        parametersToAutoApply,
        parameters,
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
