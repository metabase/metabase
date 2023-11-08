import _ from "underscore";
import type {
  CardId,
  DashboardCard,
  DashboardId,
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

export function getAllDashboardCardsWithUnmappedParameters(
  dashboard: DashboardState,
  dashboardId: DashboardId,
  parameter_id: ParameterId,
  excludeDashcardIds: DashCardId[] = [],
) {
  return getExistingDashCards(dashboard, dashboardId).filter(dashcard => {
    return (
      !excludeDashcardIds.includes(dashcard.id) &&
      !dashcard.parameter_mappings?.some(
        mapping => mapping.parameter_id === parameter_id,
      )
    );
  });
}

export function getMatchingParameterOption(
  dashcardToCheck: DashboardCard,
  targetDimension: ParameterTarget,
  targetDashcard: DashboardCard,
  metadata: Metadata,
) {
  if (!dashcardToCheck) {
    return [];
  }

  return getParameterMappingOptions(
    metadata,
    null,
    dashcardToCheck.card,
    // TODO: mapping-options.js/getParameterMappingOptions needs to be converted to typescript as the TS
    // checker thinks that this parameter should be (null | undefined), not (DashboardCard | null | undefined)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    dashcardToCheck,
  ).find((param: { target: ParameterTarget }) =>
    compareMappingOptionTargets(
      targetDimension,
      param.target,
      targetDashcard,
      dashcardToCheck,
      metadata,
    ),
  );
}

export function getAutoWiredMappingsForDashcards(
  sourceDashcard: DashboardCard,
  targetDashcards: DashboardCard[],
  parameter_id: ParameterId,
  target: ParameterTarget,
  metadata: Metadata,
) {
  const targetDashcardMappings = [];

  for (const targetDashcard of targetDashcards) {
    const selectedMappingOption = getMatchingParameterOption(
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
  target: ParameterTarget,
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
