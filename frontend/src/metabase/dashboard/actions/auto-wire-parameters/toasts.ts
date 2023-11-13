import { t } from "ttag";
import _ from "underscore";
import type {
  DashboardCard,
  DashboardId,
  DashCardId,
  ParameterId,
} from "metabase-types/api";
import type { Dispatch, GetState } from "metabase-types/store";
import { setMultipleDashCardAttributes } from "metabase/dashboard/actions";
import { disableAutoWireForParameterTarget } from "metabase/dashboard/actions/auto-wire-parameters/actions";
import { getParameterMappings } from "metabase/dashboard/actions/auto-wire-parameters/utils";
import { getAutoWireParameterToast } from "metabase/dashboard/selectors";
import { createThunkAction } from "metabase/lib/redux";
import { addUndo, dismissUndo } from "metabase/redux/undo";

export const SHOW_AUTO_WIRE_PARAMETER_TOAST =
  "metabase/dashboard/SHOW_AUTO_WIRE_PARAMETER_TOAST";
export const HIDE_AUTO_WIRE_PARAMTER_TOAST =
  "metabase/dashboard/HIDE_AUTO_WIRE_PARAMTER_TOAST";
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
