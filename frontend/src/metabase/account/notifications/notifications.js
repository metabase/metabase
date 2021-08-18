import {
  combineReducers,
  createThunkAction,
  handleActions,
} from "metabase/lib/redux";
import { AlertApi, PulseApi } from "metabase/services";

export const FETCH_ALERTS = "metabase/account/notifications/FETCH_ALERTS";
export const FETCH_PULSES = "metabase/account/notifications/FETCH_PULSES";

export const fetchAlerts = createThunkAction(FETCH_ALERTS, () => {
  return async () => {
    return await AlertApi.list();
  };
});

export const fetchPulses = createThunkAction(FETCH_PULSES, () => {
  return async () => {
    return await PulseApi.list();
  };
});

const alerts = handleActions({
  [FETCH_ALERTS]: { next: (state, { payload }) => payload },
});

const pulses = handleActions({
  [FETCH_PULSES]: { next: (state, { payload }) => payload },
});

export default combineReducers({
  alerts,
  pulses,
});
