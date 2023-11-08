import type {
  DashboardCard,
  DashCardId,
  ParameterId,
  ParameterTarget,
} from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";
import {
  setDashCardAttributes,
  setMultipleDashCardAttributes,
} from "metabase/dashboard/actions";
import { getExistingDashCards } from "metabase/dashboard/actions/utils";
import { getDashCardById } from "metabase/dashboard/selectors";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import { getMetadata } from "metabase/selectors/metadata";
import { compareMappingOptionTargets } from "metabase-lib/parameters/utils/targets";
import {
  getAllDashboardCardsWithUnmappedParameters,
  getAutoWiredMappingsForDashcards,
  getParameterMappings,
} from "./utils";

export function autoWireDashcardsWithMatchingParameters(
  parameter_id: ParameterId,
  dashcard: DashboardCard,
  target: ParameterTarget,
) {
  return function (dispatch: Dispatch, getState: GetState) {
    const metadata = getMetadata(getState());
    const dashboard_state = getState().dashboard;
    const dashcardsToAutoApply: DashboardCard[] =
      getAllDashboardCardsWithUnmappedParameters(
        dashboard_state,
        dashboard_state.dashboardId,
        parameter_id,
      );

    dispatch(
      setMultipleDashCardAttributes({
        dashcards: getAutoWiredMappingsForDashcards(
          dashcard,
          dashcardsToAutoApply,
          parameter_id,
          target,
          metadata,
        ),
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
