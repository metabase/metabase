import { createAction } from "redux-actions";
import { t } from "ttag";

import { subscriptionApi } from "metabase/api";
import { createThunkAction } from "metabase/redux";
import type { DraftDashboardSubscription } from "metabase/redux/store";
import { addUndo } from "metabase/redux/undo";
import { getResponseErrorMessage } from "metabase/utils/errors";
import { checkNotNull } from "metabase/utils/types";
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
            subscriptionApi.endpoints.updateSubscription.initiate({
              id: checkNotNull(editingPulse.id),
              name: editingPulse.name ?? undefined,
              cards: editingPulse.cards,
              channels: editingPulse.channels,
              skip_if_empty: editingPulse.skip_if_empty,
              collection_id: editingPulse.collection_id,
              collection_position: editingPulse.collection_position,
              archived: editingPulse.archived,
              parameters: editingPulse.parameters,
            }),
          ).unwrap();
        } else {
          return await dispatch(
            subscriptionApi.endpoints.createSubscription.initiate({
              name: editingPulse.name ?? "",
              cards: editingPulse.cards,
              channels: editingPulse.channels,
              skip_if_empty: editingPulse.skip_if_empty,
              collection_id: editingPulse.collection_id,
              collection_position: editingPulse.collection_position,
              dashboard_id: editingPulse.dashboard_id,
              parameters: editingPulse.parameters,
            }),
          ).unwrap();
        }
      } catch (error) {
        const errorMessage =
          getResponseErrorMessage(error) ??
          t`Something went wrong while saving your subscription`;

        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "feedback-negative",
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
    return async function (dispatch) {
      return await dispatch(
        subscriptionApi.endpoints.testSubscription.initiate({
          id: pulse.id,
          name: pulse.name ?? "",
          cards: pulse.cards,
          channels: pulse.channels,
          skip_if_empty: pulse.skip_if_empty,
          collection_id: pulse.collection_id,
          collection_position: pulse.collection_position,
          dashboard_id: pulse.dashboard_id,
          parameters: pulse.parameters,
        }),
      ).unwrap();
    };
  },
);

export const fetchPulseFormInput = createThunkAction(
  FETCH_PULSE_FORM_INPUT,
  function () {
    return async function (dispatch): Promise<ChannelApiResponse | undefined> {
      try {
        return await dispatch(
          subscriptionApi.endpoints.getChannelInfo.initiate(),
        ).unwrap();
      } catch {
        // This request is expected to fail when the user lacks
        // "Subscriptions and Alerts" permissions. Swallow the error
        // so it doesn't surface as an unhandled rejection (EMB-967).
        return undefined;
      }
    };
  },
);
