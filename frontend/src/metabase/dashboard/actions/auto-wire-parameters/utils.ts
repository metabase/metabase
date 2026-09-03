import _ from "underscore";

import { isActionDashCard } from "metabase/actions/utils";
import { getExistingDashCards } from "metabase/dashboard/actions/utils";
import { findDashCardForInlineParameter } from "metabase/dashboard/utils";
import {
  type ParameterMappingOption,
  getMappingOptionByTarget,
  getParameterMappingOptions,
} from "metabase/parameters/utils/mapping-options";
import type { DashboardState } from "metabase/redux/store";
import {
  isQuestionDashCard,
  isVirtualDashCard,
} from "metabase/utils/dashboard";
import type Question from "metabase-lib/v1/Question";
import type {
  Card,
  CardId,
  DashboardCard,
  DashboardId,
  DashboardTabId,
  Parameter,
  ParameterId,
  ParameterTarget,
  QuestionDashboardCard,
} from "metabase-types/api";

import type { SetMultipleDashCardAttributesOpts } from "../core";

export function getAllDashboardCardsWithUnmappedParameters({
  dashboards,
  dashcards,
  dashboardId,
  parameterId,
  selectedTabId,
}: {
  dashboards: DashboardState["dashboards"];
  dashcards: DashboardState["dashcards"];
  dashboardId: DashboardId;
  parameterId: ParameterId;
  selectedTabId: DashboardTabId;
}): QuestionDashboardCard[] {
  const existingDashcards = getExistingDashCards(
    dashboards,
    dashcards,
    dashboardId,
    selectedTabId,
  );

  return existingDashcards.filter(
    (dashcard): dashcard is QuestionDashboardCard =>
      isQuestionDashCard(dashcard) &&
      getUnmappedCards(dashcard, parameterId).length > 0,
  );
}

export function getDashcardCards(dashcard: QuestionDashboardCard): Card[] {
  return [dashcard.card, ...(dashcard.series ?? [])];
}

function getUnmappedCards(
  dashcard: QuestionDashboardCard,
  parameterId: ParameterId,
): Card[] {
  return getDashcardCards(dashcard).filter(
    (card) =>
      !dashcard.parameter_mappings?.some(
        (mapping) =>
          mapping.parameter_id === parameterId && mapping.card_id === card.id,
      ),
  );
}

export function getMatchingParameterOption(
  parameter: Parameter,
  targetDashcard: QuestionDashboardCard,
  targetCard: Card,
  targetDimension: ParameterTarget,
  questions: Record<CardId, Question>,
  dashcards: DashboardCard[],
): ParameterMappingOption | null {
  const targetQuestion = questions[targetCard.id];
  const parameterDashcard = findDashCardForInlineParameter(
    parameter.id,
    dashcards,
  );
  const mappingOptions = getParameterMappingOptions(
    targetQuestion,
    parameter,
    targetCard,
    targetDashcard,
    parameterDashcard,
  );

  const matchedOption = getMappingOptionByTarget(
    mappingOptions,
    targetDimension,
    targetQuestion,
    parameter,
  );
  return matchedOption ?? null;
}

export function getMatchingParameterOptions(
  parameter: Parameter,
  targetDashcard: QuestionDashboardCard,
  targetDimension: ParameterTarget,
  questions: Record<CardId, Question>,
  dashcards: DashboardCard[],
): Map<CardId, ParameterMappingOption> {
  return getUnmappedCards(targetDashcard, parameter.id).reduce(
    (matchedOptions, card) => {
      const matchedOption = getMatchingParameterOption(
        parameter,
        targetDashcard,
        card,
        targetDimension,
        questions,
        dashcards,
      );

      if (matchedOption) {
        matchedOptions.set(card.id, matchedOption);
      }
      return matchedOptions;
    },
    new Map<CardId, ParameterMappingOption>(),
  );
}

export function getAutoWiredMappingsForDashcards(
  parameter: Parameter,
  targetDashcards: QuestionDashboardCard[],
  target: ParameterTarget,
  questions: Record<CardId, Question>,
  dashcards: DashboardCard[],
): SetMultipleDashCardAttributesOpts {
  if (targetDashcards.length === 0) {
    return [];
  }

  const targetDashcardMappings: SetMultipleDashCardAttributesOpts = [];

  for (const targetDashcard of targetDashcards) {
    const selectedMappingOptions = getMatchingParameterOptions(
      parameter,
      targetDashcard,
      target,
      questions,
      dashcards,
    );

    if (selectedMappingOptions.size > 0) {
      targetDashcardMappings.push({
        id: targetDashcard.id,
        attributes: {
          parameter_mappings: getParameterMappingsForCards(
            targetDashcard,
            parameter.id,
            selectedMappingOptions,
          ),
        },
      });
    }
  }
  return targetDashcardMappings;
}

export function getParameterMappingsForCards(
  dashcard: QuestionDashboardCard,
  parameterId: ParameterId,
  mappingOptions: Map<CardId, ParameterMappingOption>,
): NonNullable<QuestionDashboardCard["parameter_mappings"]> {
  return Array.from(mappingOptions).reduce(
    (parameterMappings, [cardId, mappingOption]) =>
      getParameterMappings(
        { ...dashcard, parameter_mappings: parameterMappings },
        parameterId,
        cardId,
        mappingOption.target,
      ),
    dashcard.parameter_mappings ?? [],
  );
}

export function getParameterMappings<DC extends DashboardCard>(
  dashcard: DC,
  parameter_id: ParameterId,
  card_id: CardId | null,
  target: ParameterTarget | null,
): NonNullable<DC["parameter_mappings"]> {
  const isVirtual = isVirtualDashCard(dashcard);
  const isAction = isActionDashCard(dashcard);

  let parameter_mappings: NonNullable<DC["parameter_mappings"]> =
    dashcard.parameter_mappings ?? [];

  // allow mapping the same parameter to multiple action targets
  if (!isAction) {
    parameter_mappings = parameter_mappings.filter(
      (m) =>
        ("card_id" in m && m.card_id !== card_id) ||
        m.parameter_id !== parameter_id,
    );
  }

  if (target) {
    if (isVirtual) {
      // If this is a virtual (text) card, remove any existing mappings for the target, since text card variables
      // can only be mapped to a single parameter.
      parameter_mappings = parameter_mappings.filter(
        (m) => !_.isEqual(m.target, target),
      );
    }

    return [
      ...parameter_mappings,
      {
        parameter_id,
        card_id,
        target,
      },
    ];
  }

  return parameter_mappings;
}
