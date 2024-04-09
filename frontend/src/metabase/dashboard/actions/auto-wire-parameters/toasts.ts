import { t } from "ttag";
import _ from "underscore";

import type { SetMultipleDashCardAttributesOpts } from "metabase/dashboard/actions";
import {
  setDashCardAttributes,
  setMultipleDashCardAttributes,
} from "metabase/dashboard/actions";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import type { QuestionDashboardCard, DashCardId } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

export const AUTO_WIRE_TOAST_ID = _.uniqueId();

export const showAutoWireParametersToast =
  ({
    dashcardAttributes,
  }: {
    dashcardAttributes: SetMultipleDashCardAttributesOpts;
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
            setMultipleDashCardAttributes({
              dashcards: dashcardAttributes,
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
    targetDashcard: QuestionDashboardCard;
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
