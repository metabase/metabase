import { handleActions, createAction } from "redux-actions";
import { updateIn, assoc } from "icepick";

export const setRequestLoading = createAction(
  "metabase/requests/SET_REQUEST_LOADING",
  (statePath, queryKey) => ({ statePath, queryKey }),
);
export const setRequestLoaded = createAction(
  "metabase/requests/SET_REQUEST_LOADED",
  (statePath, queryKey) => ({ statePath, queryKey }),
);
export const setRequestError = createAction(
  "metabase/requests/SET_REQUEST_ERROR",
  (statePath, queryKey, error) => ({ statePath, queryKey, error }),
);
export const setRequestUnloaded = createAction(
  "metabase/requests/SET_REQUEST_UNLOADED",
  statePath => ({ statePath }),
);

const initialRequestState = {
  loading: false,
  loaded: false,
  fetched: false,
  error: null,
  _isRequestState: true,
};

const requestStateReducer = handleActions(
  {
    [setRequestLoading]: {
      next: (state, { payload: { queryKey } }) => ({
        ...state,
        queryKey,
        loading: true,
        loaded: false,
        error: null,
      }),
    },
    [setRequestLoaded]: {
      next: (state, { payload: { queryKey } }) => ({
        ...state,
        queryKey,
        loading: false,
        loaded: true,
        error: null,
        fetched: true,
      }),
    },
    [setRequestError]: {
      next: (state, { payload: { queryKey, error } }) => ({
        ...state,
        queryKey,
        loading: false,
        loaded: false,
        error: error,
      }),
    },
    [setRequestUnloaded]: {
      next: state => ({
        ...state,
        loaded: false,
        error: null,
      }),
    },
  },
  initialRequestState,
);

function requestStateReducerRecursive(state, action) {
  if (!state || state._isRequestState) {
    return requestStateReducer(state, action);
  } else {
    for (const [key, subState] of Object.entries(state)) {
      state = assoc(state, key, requestStateReducerRecursive(subState, action));
    }
    return state;
  }
}

export default (state = {}, action) => {
  if (action && action.payload && action.payload.statePath) {
    state = updateIn(state, action.payload.statePath, subState =>
      requestStateReducerRecursive(subState, action),
    );
  }
  return state;
};
