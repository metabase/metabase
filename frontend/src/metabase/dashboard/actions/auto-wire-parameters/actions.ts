import { t } from "ttag";
import _ from "underscore";
import { createAction, createThunkAction } from "metabase/lib/redux";
import type {
  Card,
  DashboardCard,
  DashboardId,
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
import {
  getAutoWireParameterToast,
  getDashCardById,
  getIsCardAutoWiringDisabled,
} from "metabase/dashboard/selectors";
import { getParameterMappingOptions } from "metabase/parameters/utils/mapping-options";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import { getMetadata } from "metabase/selectors/metadata";
import type { Dispatch, GetState } from "metabase-types/store";
import { compareMappingOptionTargets } from "metabase-lib/parameters/utils/targets";

export const SHOW_AUTO_WIRE_PARAMETER_TOAST =
  "metabase/dashboard/SHOW_AUTO_WIRE_PARAMETER_TOAST";
export const HIDE_AUTO_WIRE_PARAMTER_TOAST =
  "metabase/dashboard/HIDE_AUTO_WIRE_PARAMTER_TOAST";
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

    const isDisabled = getIsCardAutoWiringDisabled(
      getState(),
      dashboard_state.dashboardId,
      dashcard.id,
    );

    if (isDisabled) {
      return;
    }

    const dashcardsToAutoApply = getAllDashboardCardsWithUnmappedParameters({
      dashboardState: dashboard_state,
      dashboardId: dashboard_state.dashboardId,
      parameter_id: parameter_id,
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

    const toastId = _.uniqueId();

    dispatch(
      addUndo({
        id: toastId,
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

          dispatch(
            addUndo({
              message: t`Auto-connection was disabled. You'll need to manually connect filters to this question.`,
            }),
          );
        },
      }),
    );
  };
}

export const showAutoWireParametersToast = createThunkAction(
  SHOW_AUTO_WIRE_PARAMETER_TOAST,
  ({
      dashboardId,
      parameter_id,
      sourceDashcardId,
      modifiedDashcards,
    }: {
      dashboardId: DashboardId;
      parameter_id: ParameterId;
      sourceDashcardId: DashCardId;
      modifiedDashcards: DashboardCard[];
    }) =>
    (dispatch: Dispatch, getState: GetState) => {
      const toastId = _.uniqueId();

      dispatch(
        addUndo({
          id: toastId,
          message: t`This filter has been auto-connected with questions with the same field.`,
          actionLabel: t`Undo auto-connection`,
          undo: true,
          action: () => {
            dispatch(
              disableAutoWireForParameterTarget({
                sourceDashcardId,
                dashboardId,
              }),
            );

            dispatch(
              setMultipleDashCardAttributes({
                dashcards: modifiedDashcards.map(dc => ({
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

            dispatch(
              addUndo({
                message: t`Auto-connection was disabled. You'll need to manually connect filters to this question.`,
              }),
            );
          },
        }),
      );

      return { toastId, dashboardId };
    },
);

export const closeAutoWireParameterToast = createThunkAction(
  HIDE_AUTO_WIRE_PARAMTER_TOAST,
  () => (dispatch: Dispatch, getState: GetState) => {
    const { id } = getAutoWireParameterToast(getState());

    if (id) {
      dispatch(dismissUndo(id, false));
    }
  },
);
