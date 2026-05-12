import { createAction } from "redux-actions";
import { t } from "ttag";

import { getActionErrorMessage } from "metabase/actions/utils";
import { subscriptionApi } from "metabase/api";
import { createThunkAction } from "metabase/redux";
import type { DraftDashboardSubscription } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";
import { PulseApi } from "metabase/services";
import type {
  ChannelApiResponse,
  CreateSubscriptionRequest,
  DashboardSubscription,
  UpdateSubscriptionRequest,
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

export const updateEditingPulse = createAction<
  DashboardSubscription | DraftDashboardSubscription
>(UPDATE_EDITING_PULSE);
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
            subscriptionApi.endpoints.updateSubscription.initiate(
              editingPulse as unknown as UpdateSubscriptionRequest,
            ),
          ).unwrap();
        } else {
          return await dispatch(
            subscriptionApi.endpoints.createSubscription.initiate(
              editingPulse as unknown as CreateSubscriptionRequest,
            ),
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

export const testPulse = createThunkAction(
  TEST_PULSE,
  function (pulse: DashboardSubscription | DraftDashboardSubscription) {
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
