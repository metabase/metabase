/* @flow weak */

import { handleActions, createAction } from "metabase/lib/redux";
import { updateIn, dissocIn } from "icepick";

export const setRequestLoading = createAction(
  "metabase/requests/SET_REQUEST_LOADING",
  statePath => ({ statePath }),
);
export const setRequestLoaded = createAction(
  "metabase/requests/SET_REQUEST_LOADED",
  statePath => ({ statePath }),
);
export const setRequestError = createAction(
  "metabase/requests/SET_REQUEST_ERROR",
  (statePath, error) => ({ statePath, error }),
);
export const setRequestUnloaded = createAction(
  "metabase/requests/SET_REQUEST_UNLOADED",
  statePath => ({ statePath }),
);

const RESET_REQUEST_STATES = "metabase/requests/RESET_REQUEST_STATES";
export const resetRequestStates = createAction(
  RESET_REQUEST_STATES,
  statePath => ({ statePath }),
);

const initialRequestState = {
  loading: false,
  loaded: false,
  fetched: false,
  error: null,
};

const requestStateReducer = handleActions(
  {
    [setRequestLoading]: {
      next: state => ({
        ...state,
        loading: true,
        loaded: false,
        error: null,
      }),
    },
    [setRequestLoaded]: {
      next: state => ({
        ...state,
        loading: false,
        loaded: true,
        error: null,
        fetched: true,
      }),
    },
    [setRequestError]: {
      next: (state, { payload: { error } }) => ({
        ...state,
        loading: false,
        loaded: false,
        error: error,
      }),
    },
    [setRequestUnloaded]: {
      next: state => ({
        ...initialRequestState,
        fetched: state.fetched,
      }),
    },
  },
  initialRequestState,
);

export default (state = {}, action) => {
  if (action && action.payload && action.payload.statePath) {
    if (action.type === RESET_REQUEST_STATES) {
      return dissocIn(state, action.payload.statePath);
    }
    return updateIn(state, action.payload.statePath, requestState =>
      requestStateReducer(requestState, action),
    );
  }
  return state;
};
