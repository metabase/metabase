import _ from "underscore";
import type {
  CardId,
  DashboardCard,
  DashboardId,
  DashboardParameterMapping,
  DashCardId,
  ParameterId,
  ParameterTarget,
} from "metabase-types/api";
import type { DashboardState } from "metabase-types/store";
import { isActionDashCard } from "metabase/actions/utils";
import { getExistingDashCards } from "metabase/dashboard/actions/utils";
import { isVirtualDashCard } from "metabase/dashboard/utils";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import { compareMappingOptionTargets } from "metabase-lib/parameters/utils/targets";
import type Metadata from "metabase-lib/metadata/Metadata";

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
}) {
  const cards = getExistingDashCards(
    dashboardState.dashboards,
    dashboardState.dashcards,
    dashboardId,
  );
  return cards.filter(dashcard => {
    return (
      !excludeDashcardIds.includes(dashcard.id) &&
      !dashcard.parameter_mappings?.some(
        mapping => mapping.parameter_id === parameterId,
      )
    );
  });
}

export function getMatchingParameterOption(
  dashcardToCheck: DashboardCard,
  targetDimension: ParameterTarget,
  targetDashcard: DashboardCard,
  metadata: Metadata,
): {
  target: ParameterTarget;
} | null {
  if (!dashcardToCheck) {
    return null;
  }

  return (
    getParameterMappingOptions(
      metadata,
      null,
      dashcardToCheck.card,
      dashcardToCheck,
    ).find((param: { target: ParameterTarget }) =>
      compareMappingOptionTargets(
        targetDimension,
        param.target,
        targetDashcard.card,
        dashcardToCheck.card,
        metadata,
      ),
    ) ?? null
  );
}

export type DashCardAttribute = {
  id: DashCardId;
  attributes: {
    parameter_mappings: DashboardParameterMapping[];
  };
};

export function getAutoWiredMappingsForDashcards(
  sourceDashcard: DashboardCard,
  targetDashcards: DashboardCard[],
  parameter_id: ParameterId,
  target: ParameterTarget,
  metadata: Metadata,
): DashCardAttribute[] {
  if (targetDashcards.length === 0) {
    return [];
  }

  const targetDashcardMappings: DashCardAttribute[] = [];

  for (const targetDashcard of targetDashcards) {
    const selectedMappingOption: {
      target: ParameterTarget;
    } | null = getMatchingParameterOption(
      targetDashcard,
      target,
      sourceDashcard,
      metadata,
    );

    if (selectedMappingOption && targetDashcard.card_id) {
      targetDashcardMappings.push({
        id: targetDashcard.id,
        attributes: {
          parameter_mappings: getParameterMappings(
            targetDashcard,
            parameter_id,
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
  dashcard: DashboardCard,
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
