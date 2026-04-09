import { createAction } from "redux-actions";
import { t } from "ttag";

import { getActionErrorMessage } from "metabase/actions/utils";
import { Pulses } from "metabase/entities/pulses";
import { createThunkAction } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { PulseApi } from "metabase/services";
import type {
  ChannelApiResponse,
  DashboardSubscription,
} from "metabase-types/api";

import { getEditingPulse } from "./selectors";

export const SET_EDITING_PULSE = "SET_EDITING_PULSE";
export const UPDATE_EDITING_PULSE = "UPDATE_EDITING_PULSE";
export const SAVE_EDITING_PULSE = "SAVE_EDITING_PULSE";
export const CANCEL_EDITING_PULSE = "CANCEL_EDITING_PULSE";
export const TEST_PULSE = "TEST_PULSE";

export const FETCH_PULSE_FORM_INPUT = "FETCH_PULSE_FORM_INPUT";

export const FETCH_PULSE_LIST_BY_DASHBOARD_ID =
  "FETCH_PULSE_LIST_BY_DASHBOARD_ID";

export const updateEditingPulse =
  createAction<DashboardSubscription>(UPDATE_EDITING_PULSE);
export const cancelEditingPulse = createAction(CANCEL_EDITING_PULSE);

export const saveEditingPulse = createThunkAction(
  SAVE_EDITING_PULSE,
  function () {
    return async function (dispatch, getState) {
      const editingPulse = getEditingPulse(getState());
      const isEdit = editingPulse.id != null;

      try {
        if (isEdit) {
          return Pulses.HACK_getObjectFromAction(
            await dispatch(Pulses.actions.update(editingPulse)),
          );
        } else {
          return Pulses.HACK_getObjectFromAction(
            await dispatch(Pulses.actions.create(editingPulse)),
          );
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

export const testPulse = createThunkAction(
  TEST_PULSE,
  function (pulse: DashboardSubscription) {
    return async function () {
      return await PulseApi.test(pulse);
    };
  },
);

export const fetchPulseFormInput = createThunkAction(
  FETCH_PULSE_FORM_INPUT,
  function () {
    return async function (): Promise<ChannelApiResponse | undefined> {
      try {
        return await PulseApi.form_input();
      } catch {
        // This request is expected to fail when the user lacks
        // "Subscriptions and Alerts" permissions. Swallow the error
        // so it doesn't surface as an unhandled rejection (EMB-967).
        return undefined;
      }
    };
  },
);
