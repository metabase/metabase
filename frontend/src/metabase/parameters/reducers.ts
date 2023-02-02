import { handleActions } from "redux-actions";
import {
  INITIALIZE,
  RESET,
  SAVE_DASHBOARD_AND_CARDS,
} from "metabase/dashboard/actions";
import {
  API_UPDATE_QUESTION,
  INITIALIZE_QB,
  RESET_QB,
} from "metabase/query_builder/actions";
import { ParameterValuesCache } from "metabase-types/store/parameters";
import { FETCH_PARAMETER_VALUES, FetchParameterValuesPayload } from "./actions";

export const parameterValuesCache = handleActions<
  ParameterValuesCache,
  FetchParameterValuesPayload
>(
  {
    [FETCH_PARAMETER_VALUES]: {
      next: (state, { payload: { requestKey, response } }) =>
        state[requestKey] !== response
          ? { ...state, [requestKey]: response }
          : state,
    },
    // dashboards
    [INITIALIZE]: { next: () => ({}) },
    [SAVE_DASHBOARD_AND_CARDS]: { next: () => ({}) },
    [RESET]: { next: () => ({}) },
    // query builder
    [INITIALIZE_QB]: { next: () => ({}) },
    [API_UPDATE_QUESTION]: { next: () => ({}) },
    [RESET_QB]: { next: () => ({}) },
  },
  {},
);
