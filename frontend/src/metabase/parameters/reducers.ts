import { handleActions } from "redux-actions";

import {
  INITIALIZE,
  RESET,
  UPDATE_DASHBOARD_AND_CARDS,
} from "metabase/dashboard/actions";
import {
  API_UPDATE_QUESTION,
  INITIALIZE_QB,
  RESET_QB,
} from "metabase/query_builder/actions";
import type { ParameterValuesCache } from "metabase-types/store/parameters";

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
