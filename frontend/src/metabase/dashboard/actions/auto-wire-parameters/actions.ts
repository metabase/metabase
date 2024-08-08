import {
  setDashCardAttributes,
  setMultipleDashCardAttributes,
} from "metabase/dashboard/actions";
import {
  closeAutoWireParameterToast,
  showAddedCardAutoWireParametersToast,
  showAutoWireParametersToast,
} from "metabase/dashboard/actions/auto-wire-parameters/toasts";
import {
  getAllDashboardCardsWithUnmappedParameters,
  getAutoWiredMappingsForDashcards,
  getParameterMappings,
} from "metabase/dashboard/actions/auto-wire-parameters/utils";
import { getExistingDashCards } from "metabase/dashboard/actions/utils";
import { getMappingOptionByTarget } from "metabase/dashboard/components/DashCard/utils";
import {
  getDashCardById,
  getParameters,
  getQuestions,
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
} from "metabase-types/api";
import type { Dispatch, GetState, StoreDashcard } from "metabase-types/store";

export function autoWireDashcardsWithMatchingParameters(
  parameter_id: ParameterId,
  dashcard: QuestionDashboardCard,
  target: ParameterTarget,
) {
  return function (dispatch: Dispatch, getState: GetState) {
    const metadata = getMetadata(getState());
    const dashboard_state = getState().dashboard;
    const questions = getQuestions(getState());
    const parameter = getParameters(getState()).find(
      ({ id }) => id === parameter_id,
    );

    if (!dashboard_state.dashboardId || !parameter) {
      return;
    }

    const dashcardsToAutoApply = getAllDashboardCardsWithUnmappedParameters({
      dashboardState: dashboard_state,
      dashboardId: dashboard_state.dashboardId,
      parameterId: parameter_id,
      excludeDashcardIds: [dashcard.id],
    });

    const dashcardAttributes = getAutoWiredMappingsForDashcards(
      parameter,
      dashcard,
      dashcardsToAutoApply,
      target,
      metadata,
      questions,
    );

    if (dashcardAttributes.length === 0) {
      return;
    }

    dispatch(
      setMultipleDashCardAttributes({
        dashcards: dashcardAttributes,
      }),
    );

    const originalDashcardAttributes = dashcardsToAutoApply.map(dashcard => ({
      id: dashcard.id,
      attributes: {
        parameter_mappings: dashcard.parameter_mappings,
      },
    }));

    dispatch(
      showAutoWireParametersToast({
        dashcardAttributes: originalDashcardAttributes,
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

    const questions = getQuestions(getState());
    const parameters = getParameters(getState());

    const dashcards = getExistingDashCards(
      dashboardState.dashboards,
      dashboardState.dashcards,
      dashboardId,
    );

    const targetDashcard: StoreDashcard = getDashCardById(
      getState(),
      dashcard_id,
    );

    if (!targetDashcard || !isQuestionDashCard(targetDashcard)) {
      return;
    }

    const targetQuestion =
      questions[targetDashcard.card.id] ??
      new Question(targetDashcard.card, metadata);

    const parametersToAutoApply = [];
    const processedParameterIds = new Set();

    for (const parameter of parameters) {
      const dashcardMappingOptions = getParameterMappingOptions(
        targetQuestion,
        parameter,
        targetDashcard.card,
        targetDashcard,
      );

      for (const dashcard of dashcards) {
        const mappings = (dashcard.parameter_mappings ?? []).filter(
          mapping => mapping.parameter_id === parameter.id,
        );

        for (const mapping of mappings) {
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
            parametersToAutoApply.push(
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

    if (parametersToAutoApply.length === 0) {
      return;
    }

    dispatch(
      setDashCardAttributes({
        id: dashcard_id,
        attributes: {
          parameter_mappings: parametersToAutoApply,
        },
      }),
    );

    dispatch(
      showAddedCardAutoWireParametersToast({
        targetDashcard,
        dashcard_id,
      }),
    );
  };
}
