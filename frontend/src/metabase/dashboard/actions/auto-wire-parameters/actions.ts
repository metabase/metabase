import { t } from "ttag";
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
  showAutoWireParametersToast,
  showDisabledAutoConnectionToast,
} from "metabase/dashboard/actions/auto-wire-parameters/toasts";
import {
  getAllDashboardCardsWithUnmappedParameters,
  getAutoWiredMappingsForDashcards,
  getParameterMappings,
} from "metabase/dashboard/actions/auto-wire-parameters/utils";

import { getExistingDashCards } from "metabase/dashboard/actions/utils";
import {
  getDashCardById,
  getDisabledAutoWireCards,
  getIsCardAutoWiringDisabled,
} from "metabase/dashboard/selectors";
import { createAction } from "metabase/lib/redux";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import { addUndo } from "metabase/redux/undo";
import { getMetadata } from "metabase/selectors/metadata";
import { compareMappingOptionTargets } from "metabase-lib/parameters/utils/targets";

export const DISABLE_AUTO_WIRE_FOR_PARAMETER_TARGET =
  "metabase/dashboard/DISABLE_AUTO_WIRE_FOR_PARAMETER_TARGET";

export const disableAutoWireForParameterTarget = createAction(
  DISABLE_AUTO_WIRE_FOR_PARAMETER_TARGET,
);

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

    const disabledDashcards = getDisabledAutoWireCards(
      getState(),
      dashboard_state.dashboardId,
    );
    const isDisabled = disabledDashcards.includes(dashcard.id);

    if (isDisabled) {
      return;
    }

    const dashcardsToAutoApply = getAllDashboardCardsWithUnmappedParameters({
      dashboardState: dashboard_state,
      dashboardId: dashboard_state.dashboardId,
      parameter_id: parameter_id,
      excludeDashcardIds: [dashcard.id, ...disabledDashcards],
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

    dispatch(
      showAutoWireParametersToast({
        dashboardId: dashboard_state.dashboardId,
        parameter_id,
        sourceDashcardId: dashcard.id,
        modifiedDashcards: dashcardsToAutoApply,
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

    const disabledDashcards = [
      dashcard_id,
      ...getDisabledAutoWireCards(getState(), dashboardId),
    ];

    const dashcards = getExistingDashCards(
      dashboardState.dashboards,
      dashboardState.dashcards,
      dashboardId,
    ).filter(dc => !disabledDashcards.includes(dc.id));

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
      // TODO: mapping-options.js/getParameterMappingOptions needs to be converted to typescript as the TS
      // checker thinks that this parameter should be (null | undefined), not (StoreDashcard/Dashcard | null | undefined)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
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
              param.target,
            ),
          );
          processedParameterIds.add(param.parameter_id);
        }
      }
    }

    if (parametersToAutoApply.length === 0) {
      return;
    }

    const isDisabled = getIsCardAutoWiringDisabled(
      getState(),
      dashboardId,
      dashcard_id,
    );

    if (isDisabled) {
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

    // const toastId = _.uniqueId();

    dispatch(
      addUndo({
        // id: toastId,
        message: t`${targetDashcard.card.name} has been auto-connected with filters with the same field.`,
        actionLabel: t`Undo auto-connection`,
        undo: true,
        action: () => {
          dispatch(
            disableAutoWireForParameterTarget({
              sourceDashcardId: dashcard_id,
              dashboardId,
            }),
          );

          dispatch(
            setDashCardAttributes({
              id: dashcard_id,
              attributes: {
                parameter_mappings: [],
              },
            }),
          );

          dispatch(showDisabledAutoConnectionToast());
        },
      }),
    );
  };
}
