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
import { getDashCardById, getQuestions } from "metabase/dashboard/selectors";
import { isQuestionDashCard } from "metabase/dashboard/utils";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import { compareMappingOptionTargets } from "metabase-lib/v1/parameters/utils/targets";
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

    if (!dashboard_state.dashboardId) {
      return;
    }

    const dashcardsToAutoApply = getAllDashboardCardsWithUnmappedParameters({
      dashboardState: dashboard_state,
      dashboardId: dashboard_state.dashboardId,
      parameterId: parameter_id,
      excludeDashcardIds: [dashcard.id],
    });

    const dashcardAttributes = getAutoWiredMappingsForDashcards(
      dashcard,
      dashcardsToAutoApply,
      parameter_id,
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

    const dashcards = getExistingDashCards(
      dashboardState.dashboards,
      dashboardState.dashcards,
      dashboardId,
    );

    const dashcardWithQuestions: Array<[StoreDashcard, Question]> =
      dashcards.map(dashcard => [
        dashcard,
        isQuestionDashCard(dashcard)
          ? questions[dashcard.card.id] ?? new Question(dashcard.card, metadata)
          : new Question(dashcard.card, metadata),
      ]);

    const targetDashcard: StoreDashcard = getDashCardById(
      getState(),
      dashcard_id,
    );

    if (!targetDashcard || !isQuestionDashCard(targetDashcard)) {
      return;
    }

    const dashcardMappingOptions = getParameterMappingOptions(
      questions[targetDashcard.card.id] ??
        new Question(targetDashcard.card, metadata),
      null,
      targetDashcard.card,
      targetDashcard,
    );

    const targetQuestion =
      questions[targetDashcard.card.id] ??
      new Question(targetDashcard.card, metadata);

    const parametersToAutoApply = [];
    const processedParameterIds = new Set();

    for (const opt of dashcardMappingOptions) {
      for (const [dashcard, question] of dashcardWithQuestions) {
        const param = dashcard.parameter_mappings?.find(mapping =>
          compareMappingOptionTargets(
            mapping.target,
            opt.target,
            question,
            targetQuestion,
          ),
        );

        if (
          targetDashcard.card_id &&
          param &&
          !processedParameterIds.has(param.parameter_id)
        ) {
          parametersToAutoApply.push(
            ...getParameterMappings(
              targetDashcard,
              param.parameter_id,
              targetDashcard.card_id,
              opt.target,
            ),
          );
          processedParameterIds.add(param.parameter_id);
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
