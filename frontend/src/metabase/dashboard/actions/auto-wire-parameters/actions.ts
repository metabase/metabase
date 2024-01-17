import type {
  Card,
  DashboardCard,
  DashCardId,
  ParameterId,
  ParameterTarget,
} from "metabase-types/api";
import type { Dispatch, GetState, StoreDashcard } from "metabase-types/store";
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
import { getDashCardById } from "metabase/dashboard/selectors";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import { getMetadata } from "metabase/selectors/metadata";
import { compareMappingOptionTargets } from "metabase-lib/parameters/utils/targets";

export function autoWireDashcardsWithMatchingParameters(
  parameter_id: ParameterId,
  dashcard: DashboardCard,
  target: ParameterTarget,
) {
  return function (dispatch: Dispatch, getState: GetState) {
    const metadata = getMetadata(getState());
    const dashboard_state = getState().dashboard;

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

    const dashcards = getExistingDashCards(
      dashboardState.dashboards,
      dashboardState.dashcards,
      dashboardId,
    );

    const targetDashcard: StoreDashcard = getDashCardById(
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
            dashcard.card as Card,
            targetDashcard.card as Card,
            metadata,
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
