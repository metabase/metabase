import _ from "underscore";

import { isActionDashCard } from "metabase/actions/utils";
import { getExistingDashCards } from "metabase/dashboard/actions/utils";
import { getMappingOptionByTarget } from "metabase/dashboard/components/DashCard/utils";
import {
  isQuestionDashCard,
  isVirtualDashCard,
} from "metabase/dashboard/utils";
import {
  getParameterMappingOptions,
  type ParameterMappingOption,
} from "metabase/parameters/utils/mapping-options";
import type Question from "metabase-lib/v1/Question";
import type {
  CardId,
  QuestionDashboardCard,
  DashboardId,
  DashCardId,
  ParameterId,
  ParameterTarget,
  Parameter,
  DashboardTabId,
  DashboardCard,
  DashboardParameterMapping,
  ActionParametersMapping,
  VirtualDashCardParameterMapping,
} from "metabase-types/api";
import type { DashboardState } from "metabase-types/store";

import type { SetMultipleDashCardAttributesOpts } from "../core";

export function getAllDashboardCardsWithUnmappedParameters({
  dashboards,
  dashcards,
  dashboardId,
  parameterId,
  selectedTabId,
  excludeDashcardIds = [],
}: {
  dashboards: DashboardState["dashboards"];
  dashcards: DashboardState["dashcards"];
  dashboardId: DashboardId;
  parameterId: ParameterId;
  selectedTabId: DashboardTabId;
  excludeDashcardIds?: DashCardId[];
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
  questions: Record<CardId, Question>,
): ParameterMappingOption | null | undefined {
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
  );
  return matchedOption ?? null;
}

export function getAutoWiredMappingsForDashcards(
  parameter: Parameter,
  targetDashcards: QuestionDashboardCard[],
  target: ParameterTarget,
  questions: Record<CardId, Question>,
): SetMultipleDashCardAttributesOpts {
  if (targetDashcards.length === 0) {
    return [];
  }

  const targetDashcardMappings: SetMultipleDashCardAttributesOpts = [];

  for (const targetDashcard of targetDashcards) {
    const selectedMappingOption = getMatchingParameterOption(
      parameter,
      targetDashcard,
      target,
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
// TODO: this function should automatically calculate return type based on the
// type of dashcard
export function getParameterMappings(
  dashcard: DashboardCard,
  parameter_id: ParameterId,
  card_id: CardId,
  target: ParameterTarget | null,
) {
  const isVirtual = isVirtualDashCard(dashcard);
  const isAction = isActionDashCard(dashcard);

  let parameter_mappings: (
    | DashboardParameterMapping
    | ActionParametersMapping
    | VirtualDashCardParameterMapping
  )[] = dashcard.parameter_mappings || [];

  // allow mapping the same parameter to multiple action targets
  if (!isAction) {
    parameter_mappings = parameter_mappings.filter(
      m =>
        ("card_id" in m && m.card_id !== card_id) ||
        m.parameter_id !== parameter_id,
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
