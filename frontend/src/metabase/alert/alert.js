import _ from "underscore";
import { handleActions } from "redux-actions";
import { combineReducers } from "@reduxjs/toolkit";
import { t } from "ttag";
import { addUndo } from "metabase/redux/undo";
import { AlertApi } from "metabase/services";
import { RestfulRequest } from "metabase/lib/request";
import { Icon } from "metabase/core/components/Icon";

export const FETCH_ALL_ALERTS = "metabase/alerts/FETCH_ALL_ALERTS";
const fetchAllAlertsRequest = new RestfulRequest({
  endpoint: AlertApi.list,
  actionPrefix: FETCH_ALL_ALERTS,
  storeAsDictionary: true,
});
export const fetchAllAlerts = () => {
  return async (dispatch, getState) => {
    await dispatch(fetchAllAlertsRequest.trigger());
    dispatch({ type: FETCH_ALL_ALERTS });
  };
};

export const FETCH_ALERTS_FOR_QUESTION_CLEAR_OLD_ALERTS =
  "metabase/alerts/FETCH_ALERTS_FOR_QUESTION_CLEAR_OLD_ALERTS";
export const FETCH_ALERTS_FOR_QUESTION =
  "metabase/alerts/FETCH_ALERTS_FOR_QUESTION";
const fetchAlertsForQuestionRequest = new RestfulRequest({
  endpoint: AlertApi.list_for_question,
  actionPrefix: FETCH_ALERTS_FOR_QUESTION,
  storeAsDictionary: true,
});
export const fetchAlertsForQuestion = questionId => {
  return async (dispatch, getState) => {
    dispatch({
      payload: questionId,
      type: FETCH_ALERTS_FOR_QUESTION_CLEAR_OLD_ALERTS,
    });
    await dispatch(fetchAlertsForQuestionRequest.trigger({ questionId }));
    dispatch({ type: FETCH_ALERTS_FOR_QUESTION });
  };
};

export const CREATE_ALERT = "metabase/alerts/CREATE_ALERT";
const createAlertRequest = new RestfulRequest({
  endpoint: AlertApi.create,
  actionPrefix: CREATE_ALERT,
  storeAsDictionary: true,
});
export const createAlert = alert => {
  return async (dispatch, getState) => {
    // TODO: How to handle a failed creation and display it to a user?
    // Maybe RestfulRequest.trigger should throw an exception
    // that the React component calling createAlert could catch ...?
    await dispatch(createAlertRequest.trigger(alert));

    dispatch(
      addUndo({
        // eslint-disable-next-line react/display-name
        message: () => (
          <div className="flex align-center text-bold">
            <Icon name="alert_confirm" size="19" className="mr2 text-success" />
            {t`Your alert is all set up.`}
          </div>
        ),
      }),
    );

    dispatch({ type: CREATE_ALERT });
  };
};

// NOTE: backend is a little picky about the properties present on the alert
function cleanAlert(alert) {
  alert = {
    ...alert,
    card: _.pick(alert.card, "id", "include_csv", "include_xls"),
  };
  if (alert.collection_id == null) {
    delete alert.collection_id;
  }
  if (alert.alert_above_goal == null) {
    delete alert.alert_above_goal;
  }
  return alert;
}

export const UPDATE_ALERT = "metabase/alerts/UPDATE_ALERT";
const updateAlertRequest = new RestfulRequest({
  endpoint: AlertApi.update,
  actionPrefix: UPDATE_ALERT,
  storeAsDictionary: true,
});
export const updateAlert = alert => {
  return async (dispatch, getState) => {
    await dispatch(updateAlertRequest.trigger(cleanAlert(alert)));

    dispatch(
      addUndo({
        // eslint-disable-next-line react/display-name
        message: () => (
          <div className="flex align-center text-bold">
            <Icon name="alert_confirm" size="19" className="mr2 text-success" />
            {t`Your alert was updated.`}
          </div>
        ),
      }),
    );

    dispatch({ type: UPDATE_ALERT });
  };
};

export const UNSUBSCRIBE_FROM_ALERT = "metabase/alerts/UNSUBSCRIBE_FROM_ALERT";
export const UNSUBSCRIBE_FROM_ALERT_CLEANUP =
  "metabase/alerts/UNSUBSCRIBE_FROM_ALERT_CLEANUP";
const unsubscribeFromAlertRequest = new RestfulRequest({
  endpoint: AlertApi.unsubscribe,
  actionPrefix: UNSUBSCRIBE_FROM_ALERT,
  storeAsDictionary: true,
});
export const unsubscribeFromAlert = alert => {
  return async (dispatch, getState) => {
    await dispatch(unsubscribeFromAlertRequest.trigger(alert));
    dispatch({ type: UNSUBSCRIBE_FROM_ALERT });

    // This delay lets us to show "You're unsubscribed" text in place of an
    // alert list item for a while before removing the list item completely
    setTimeout(
      () =>
        dispatch({ type: UNSUBSCRIBE_FROM_ALERT_CLEANUP, payload: alert.id }),
      5000,
    );
  };
};

export const DELETE_ALERT = "metabase/alerts/DELETE_ALERT";
const deleteAlertRequest = new RestfulRequest({
  endpoint: AlertApi.update,
  actionPrefix: DELETE_ALERT,
  storeAsDictionary: true,
});
export const deleteAlert = alertId => {
  return async (dispatch, getState) => {
    await dispatch(deleteAlertRequest.trigger({ id: alertId, archived: true }));

    dispatch(
      addUndo({
        // eslint-disable-next-line react/display-name
        message: () => (
          <div className="flex align-center text-bold">
            <Icon name="alert_confirm" size="19" className="mr2 text-success" />
            {t`The alert was successfully deleted.`}
          </div>
        ),
      }),
    );
    dispatch({ type: DELETE_ALERT, payload: alertId });
  };
};

// removal from the result dictionary (not supported by RestfulRequest yet)
const removeAlertReducer = (state, { payload: alertId }) => ({
  ...state,
  result: _.omit(state.result || {}, alertId),
});

const removeAlertsForQuestionReducer = (state, { payload: questionId }) => {
  return {
    ...state,
    result: _.omit(state.result || {}, alert => alert.card.id === questionId),
  };
};

const alerts = handleActions(
  {
    ...fetchAllAlertsRequest.getReducers(),
    [FETCH_ALERTS_FOR_QUESTION_CLEAR_OLD_ALERTS]:
      removeAlertsForQuestionReducer,
    ...fetchAlertsForQuestionRequest.getReducers(),
    ...createAlertRequest.getReducers(),
    ...updateAlertRequest.getReducers(),
    [DELETE_ALERT]: removeAlertReducer,
    [UNSUBSCRIBE_FROM_ALERT_CLEANUP]: removeAlertReducer,
  },
  [],
);

export default combineReducers({
  alerts,
});
