import { t } from "ttag";
import _ from "underscore";
import type {
  DashboardCard,
  DashboardId,
  DashCardId,
  ParameterId,
} from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";
import {
  setDashCardAttributes,
  setMultipleDashCardAttributes,
} from "metabase/dashboard/actions";
import { addUndo, dismissUndo } from "metabase/redux/undo";

export const AUTO_WIRE_TOAST_ID = _.uniqueId();

type ShowAutoWireParametersToastType = {
  dashboardId: DashboardId;
  parameter_id: ParameterId;
  sourceDashcardId: DashCardId;
  modifiedDashcards: DashboardCard[];
};

export const showAutoWireParametersToast =
  ({ modifiedDashcards }: ShowAutoWireParametersToastType) =>
  (dispatch: Dispatch) => {
    dispatch(
      addUndo({
        id: AUTO_WIRE_TOAST_ID,
        message: t`This filter has been auto-connected with questions with the same field.`,
        actionLabel: t`Undo auto-connection`,
        undo: true,
        action: () => {
          dispatch(
            setMultipleDashCardAttributes({
              dashcards: modifiedDashcards.map(dc => ({
                id: dc.id,
                attributes: {
                  parameter_mappings: dc.parameter_mappings,
                },
              })),
            }),
          );
        },
      }),
    );
  };

export const showAddedCardAutoWireParametersToast =
  ({
    targetDashcard,
    dashcard_id,
  }: {
    targetDashcard: DashboardCard;
    dashcard_id: DashCardId;
  }) =>
  (dispatch: Dispatch) => {
    dispatch(
      addUndo({
        id: AUTO_WIRE_TOAST_ID,
        message: t`${targetDashcard.card.name} has been auto-connected with filters with the same field.`,
        actionLabel: t`Undo auto-connection`,
        undo: true,
        action: () => {
          dispatch(
            setDashCardAttributes({
              id: dashcard_id,
              attributes: {
                parameter_mappings: [],
              },
            }),
          );
        },
      }),
    );
  };

export const closeAutoWireParameterToast = () => (dispatch: Dispatch) => {
  dispatch(dismissUndo(AUTO_WIRE_TOAST_ID, false));
};
