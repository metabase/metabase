import type { Draft } from "@reduxjs/toolkit";
import _ from "underscore";
import type {
  CardId,
  DashboardCard,
  DashboardId,
  DashCardId,
  ParameterId,
  ParameterTarget,
} from "metabase-types/api";
import type { DashboardState, GetState, Dispatch } from "metabase-types/store";
import { isActionDashCard } from "metabase/actions/utils";
import { setDashCardAttributes } from "metabase/dashboard/actions/core";
import { getExistingDashCards } from "metabase/dashboard/actions/utils";
import { getDashCardById } from "metabase/dashboard/selectors";
import { isVirtualDashCard } from "metabase/dashboard/utils";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import { getMetadata } from "metabase/selectors/metadata";
import { compareMappingOptionTargets } from "metabase-lib/parameters/utils/targets";
import type Metadata from "metabase-lib/metadata/Metadata";

export function getAllDashboardCardsWithUnmappedParameters(
  dashboard: Draft<DashboardState>,
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

export function autoWireParametersToNewCard({
  dashcard_id,
}: {
  dashcard_id: DashCardId;
}) {
  return async function (dispatch: Dispatch, getState: GetState) {
    const metadata = getMetadata(getState());
    const dashboardState = getState().dashboard;
    const dashboardId = dashboardState.dashboardId;
    const dashcards = getExistingDashCards(dashboardState, dashboardId);

    const targetDashcard: DashboardCard = getDashCardById(
      getState(),
      dashcard_id,
    );

    if (!targetDashcard) {
      return;
    }

    const dashcardMappingOptions = getParameterMappingOptions(
      metadata,
      null,
      targetDashcard.card,
      targetDashcard,
    );

    const parametersToAutoApply = [];
    const processedParameterIds = new Set();

    for (const opt of dashcardMappingOptions) {
      for (const dashcard of dashcards) {
        const param = dashcard.parameter_mappings?.find(mapping =>
          compareMappingOptionTargets(
            mapping.target,
            opt.target,
            dashcard,
            targetDashcard,
            metadata,
          ),
        );

        if (param && !processedParameterIds.has(param.parameter_id)) {
          parametersToAutoApply.push(
            ...getParameterMappings(
              targetDashcard,
              param.parameter_id,
              targetDashcard.card_id,
              param.target,
            ),
          );
          processedParameterIds.add(param.parameter_id);
        }
      }
    }

    if (parametersToAutoApply.length > 0) {
      dispatch(
        setDashCardAttributes({
          id: dashcard_id,
          attributes: {
            parameter_mappings: parametersToAutoApply,
          },
        }),
      );
    }
  };
}

export function getMatchingParameterOption(
  dashcardToCheck,
  targetDimension,
  targetDashcard,
  metadata,
) {
  return getParameterMappingOptions(
    metadata,
    null,
    dashcardToCheck.card,
    dashcardToCheck,
  ).find(param =>
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
