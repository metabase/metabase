import { createAction } from "redux-actions";
import { t } from "ttag";

import { getActionErrorMessage } from "metabase/actions/utils";
import { subscriptionApi } from "metabase/api";
import {
  NEW_PULSE_TEMPLATE,
  createChannel,
  getDefaultChannel,
} from "metabase/lib/pulse";
import { createThunkAction } from "metabase/lib/redux";
import { setErrorPage } from "metabase/redux/app";
import { addUndo } from "metabase/redux/undo";

import { getEditingPulse, getPulseFormInput } from "./selectors";

export const SET_EDITING_PULSE = "SET_EDITING_PULSE";
export const UPDATE_EDITING_PULSE = "UPDATE_EDITING_PULSE";
export const SAVE_PULSE = "SAVE_PULSE";
export const SAVE_EDITING_PULSE = "SAVE_EDITING_PULSE";
export const CANCEL_EDITING_PULSE = "CANCEL_EDITING_PULSE";
export const TEST_PULSE = "TEST_PULSE";

export const FETCH_PULSE_FORM_INPUT = "FETCH_PULSE_FORM_INPUT";
export const FETCH_PULSE_CARD_PREVIEW = "FETCH_PULSE_CARD_PREVIEW";

export const FETCH_PULSE_LIST_BY_DASHBOARD_ID =
  "FETCH_PULSE_LIST_BY_DASHBOARD_ID";

export const setEditingPulse = createThunkAction(
  SET_EDITING_PULSE,
  function (id, initialCollectionId = null) {
    return async function (dispatch, getState) {
      if (id != null) {
        try {
          return await dispatch(
            subscriptionApi.endpoints.getSubscription.initiate(id),
          ).unwrap();
        } catch (e) {
          console.error(e);
          dispatch(setErrorPage(e));
        }
      } else {
        // HACK: need a way to wait for form_input to finish loading
        const fetchChannelInfo =
          subscriptionApi.endpoints.getChannelInfo.initiate;
        const channels =
          getPulseFormInput(getState()).channels ||
          (await dispatch(fetchChannelInfo()).unwrap()).channels;
        const defaultChannelSpec = getDefaultChannel(channels);
        return {
          ...NEW_PULSE_TEMPLATE,
          channels: defaultChannelSpec
            ? [createChannel(defaultChannelSpec)]
            : [],
          collection_id: initialCollectionId,
        };
      }
    };
  },
);

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

export const testPulse = createThunkAction(TEST_PULSE, function (pulse) {
  return async function (dispatch) {
    return await dispatch(
      subscriptionApi.endpoints.testSubscription.initiate(pulse),
    ).unwrap();
  };
});

export const fetchPulseFormInput = createThunkAction(
  FETCH_PULSE_FORM_INPUT,
  function () {
    return async function (dispatch) {
      return await dispatch(
        subscriptionApi.endpoints.getChannelInfo.initiate(),
      ).unwrap();
    };
  },
);

export const fetchPulsesByDashboardId = createThunkAction(
  FETCH_PULSE_LIST_BY_DASHBOARD_ID,
  function (dashboard_id) {
    return async function (dispatch) {
      return await dispatch(
        subscriptionApi.endpoints.listSubscriptions.initiate({ dashboard_id }),
      ).unwrap();
    };
  },
);
