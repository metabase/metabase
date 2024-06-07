import _ from "underscore";

import { isActionDashCard } from "metabase/actions/utils";
import { getExistingDashCards } from "metabase/dashboard/actions/utils";
import { getMappingOptionByTarget } from "metabase/dashboard/components/DashCard/utils";
import {
  isQuestionDashCard,
  isVirtualDashCard,
} from "metabase/dashboard/utils";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import type Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type {
  CardId,
  QuestionDashboardCard,
  DashboardId,
  DashCardId,
  ParameterId,
  ParameterTarget,
  Parameter,
} from "metabase-types/api";
import type { DashboardState } from "metabase-types/store";

import type { SetMultipleDashCardAttributesOpts } from "../core";

export function getAllDashboardCardsWithUnmappedParameters({
  dashboardState,
  dashboardId,
  parameterId,
  excludeDashcardIds = [],
}: {
  dashboardState: DashboardState;
  dashboardId: DashboardId;
  parameterId: ParameterId;
  excludeDashcardIds?: DashCardId[];
}): QuestionDashboardCard[] {
  const dashCards = getExistingDashCards(
    dashboardState.dashboards,
    dashboardState.dashcards,
    dashboardId,
  );
  return dashCards.filter(
    (dashcard): dashcard is QuestionDashboardCard =>
      isQuestionDashCard(dashcard) &&
      !excludeDashcardIds.includes(dashcard.id) &&
      !dashcard.parameter_mappings?.some(
        mapping => mapping.parameter_id === parameterId,
      ),
  );
}

export function getMatchingParameterOption(
  parameter: Parameter,
  targetDashcard: QuestionDashboardCard,
  targetDimension: ParameterTarget,
  sourceDashcard: QuestionDashboardCard,
  metadata: Metadata,
  questions: Record<CardId, Question>,
): {
  target: ParameterTarget;
} | null {
  if (!targetDashcard) {
    return null;
  }

  const targetQuestion = questions[targetDashcard.card.id];

  const mappingOptions = getParameterMappingOptions(
    targetQuestion,
    parameter,
    targetDashcard.card,
    targetDashcard,
  );

  const matchedOption = getMappingOptionByTarget(
    mappingOptions,
    targetDashcard,
    targetDimension,
    targetQuestion,
    parameter,
  );
  return matchedOption ?? null;
}

export function getAutoWiredMappingsForDashcards(
  parameter: Parameter,
  sourceDashcard: QuestionDashboardCard,
  targetDashcards: QuestionDashboardCard[],
  target: ParameterTarget,
  metadata: Metadata,
  questions: Record<CardId, Question>,
): SetMultipleDashCardAttributesOpts {
  if (targetDashcards.length === 0) {
    return [];
  }

  const targetDashcardMappings: SetMultipleDashCardAttributesOpts = [];

  for (const targetDashcard of targetDashcards) {
    const selectedMappingOption: {
      target: ParameterTarget;
    } | null = getMatchingParameterOption(
      parameter,
      targetDashcard,
      target,
      sourceDashcard,
      metadata,
      questions,
    );

    if (selectedMappingOption && targetDashcard.card_id) {
      targetDashcardMappings.push({
        id: targetDashcard.id,
        attributes: {
          parameter_mappings: getParameterMappings(
            targetDashcard,
            parameter.id,
            targetDashcard.card_id,
            selectedMappingOption.target,
          ),
        },
      });
    }
  }
  return targetDashcardMappings;
}

export function getParameterMappings(
  dashcard: QuestionDashboardCard,
  parameter_id: ParameterId,
  card_id: CardId,
  target: ParameterTarget | null,
) {
  const isVirtual = isVirtualDashCard(dashcard);
  const isAction = isActionDashCard(dashcard);

  let parameter_mappings = dashcard.parameter_mappings || [];

  // allow mapping the same parameter to multiple action targets
  if (!isAction) {
    parameter_mappings = parameter_mappings.filter(
      m => m.card_id !== card_id || m.parameter_id !== parameter_id,
    );
  }

  if (target) {
    if (isVirtual) {
      // If this is a virtual (text) card, remove any existing mappings for the target, since text card variables
      // can only be mapped to a single parameter.
      parameter_mappings = parameter_mappings.filter(
        m => !_.isEqual(m.target, target),
      );
    }
    parameter_mappings = parameter_mappings.concat({
      parameter_id,
      card_id,
      target,
    });
  }

  return parameter_mappings;
}
