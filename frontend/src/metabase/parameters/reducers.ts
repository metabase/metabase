import { handleActions } from "redux-actions";

import {
  INITIALIZE,
  RESET,
  UPDATE_DASHBOARD_AND_CARDS,
} from "metabase/redux/dashboard";
import {
  API_UPDATE_QUESTION,
  INITIALIZE_QB,
  RESET_QB,
} from "metabase/redux/query-builder";
import type { ParameterValuesCache } from "metabase/redux/store/parameters";

import type { FetchParameterValuesPayload } from "./actions";
import { FETCH_PARAMETER_VALUES } from "./actions";

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
    [UPDATE_DASHBOARD_AND_CARDS]: { next: () => ({}) },
    [RESET]: { next: () => ({}) },
    // query builder
    [INITIALIZE_QB]: { next: () => ({}) },
    [API_UPDATE_QUESTION]: { next: () => ({}) },
    [RESET_QB]: { next: () => ({}) },
  },
  {},
);
