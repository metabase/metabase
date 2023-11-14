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
import { addUndo, dismissUndo } from "metabase/redux/undo";

const AUTO_WIRE_TOAST_ID = _.uniqueId();
export const showAutoWireParametersToast =
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
  (dispatch: Dispatch) => {
    dispatch(
      addUndo({
        id: AUTO_WIRE_TOAST_ID,
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

          dispatch(showDisabledAutoConnectionToast());
        },
      }),
    );
  };

export const closeAutoWireParameterToast =
  () => (dispatch: Dispatch, getState: GetState) => {
    dispatch(dismissUndo(AUTO_WIRE_TOAST_ID, false));
  };

export const showDisabledAutoConnectionToast = () => (dispatch: Dispatch) => {
  dispatch(
    addUndo({
      message: t`Auto-connection was disabled. You'll need to manually connect filters to this question.`,
    }),
  );
};
