import { createAction } from "redux-actions";
import { t } from "ttag";

import { getActionErrorMessage } from "metabase/actions/utils";
import { subscriptionApi } from "metabase/api";
import { createThunkAction } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";

import { getEditingPulse } from "./selectors";

export const SET_EDITING_PULSE = "SET_EDITING_PULSE";
export const UPDATE_EDITING_PULSE = "UPDATE_EDITING_PULSE";
export const SAVE_EDITING_PULSE = "SAVE_EDITING_PULSE";
export const CANCEL_EDITING_PULSE = "CANCEL_EDITING_PULSE";

export const updateEditingPulse = createAction(UPDATE_EDITING_PULSE);
export const cancelEditingPulse = createAction(CANCEL_EDITING_PULSE);

export const saveEditingPulse = createThunkAction(
  SAVE_EDITING_PULSE,
  function () {
    return async function (dispatch, getState) {
      const editingPulse = getEditingPulse(getState());
      const isEdit = editingPulse.id != null;

      try {
        if (isEdit) {
          return await dispatch(
            subscriptionApi.endpoints.updateSubscription.initiate(editingPulse),
          ).unwrap();
        } else {
          return await dispatch(
            subscriptionApi.endpoints.createSubscription.initiate(editingPulse),
          ).unwrap();
        }
      } catch (error) {
        const errorMessage = getActionErrorMessage(error);

        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: isEdit
              ? t`Cannot edit subscription. ${errorMessage} Please contact your administrator.`
              : t`Cannot create subscription. ${errorMessage} Please contact your administrator.`,
          }),
        );

        throw error;
      }
    };
  },
);
