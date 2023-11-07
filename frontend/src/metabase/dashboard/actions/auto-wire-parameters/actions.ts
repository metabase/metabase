import { t } from "ttag";
import type {
  Card,
  DashboardCard,
  DashCardId,
  ParameterId,
  ParameterTarget,
} from "metabase-types/api";
import {
  setDashCardAttributes,
  setMultipleDashCardAttributes,
} from "metabase/dashboard/actions";
import {
  getAllDashboardCardsWithUnmappedParameters,
  getAutoWiredMappingsForDashcards,
  getParameterMappings,
} from "metabase/dashboard/actions/auto-wire-parameters/utils";

import { getExistingDashCards } from "metabase/dashboard/actions/utils";
import { getDashCardById } from "metabase/dashboard/selectors";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import { addUndo } from "metabase/redux/undo";
import { getMetadata } from "metabase/selectors/metadata";
import type { Dispatch, GetState } from "metabase-types/store";
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

    const dashcardsToAutoApply = getAllDashboardCardsWithUnmappedParameters(
      dashboard_state,
      dashboard_state.dashboardId,
      parameter_id,
    );

    if (dashcardsToAutoApply.length === 0) {
      return;
    }

    const dashcardAttributes = getAutoWiredMappingsForDashcards(
      dashcard,
      dashcardsToAutoApply,
      parameter_id,
      target,
      metadata,
    );

    dispatch(
      setMultipleDashCardAttributes({
        dashcards: dashcardAttributes,
      }),
    );

    dispatch(
      addUndo({
        message: t`This filter has been auto-connected with questions with the same field.`,
        actionLabel: t`Undo auto-connection`,
        undo: true,
        action: () => {
          dispatch(
            setMultipleDashCardAttributes({
              dashcards: dashcardsToAutoApply.map(dc => ({
                id: dc.id,
                attributes: {
                  parameter_mappings: getParameterMappings(
                    dc,
                    parameter_id,
                    dc.card.id,
                    null,
                  ),
                },
              })),
            }),
          );
        },
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

    if (!dashboardId) {
      return;
    }

    const dashcards = getExistingDashCards(
      dashboardState.dashboards,
      dashboardState.dashcards,
      dashboardId,
    );

    const targetDashcard = getDashCardById(getState(), dashcard_id);

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
