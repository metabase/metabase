import { assoc, getIn, updateIn } from "icepick";
import { type Action, createAction, handleActions } from "redux-actions";

export type RequestState = {
  loading: boolean;
  loaded: boolean;
  fetched: boolean;
  error: unknown | null;
  queryKey?: string;
  queryPromise?: Promise<unknown> | null;
  _isRequestState: true;
};

export type RequestsStateTree = {
  [key: string]: RequestsStateTree | RequestState;
};

type StatePath = (string | number)[];

type RequestActionPayload = {
  statePath?: StatePath;
  queryKey?: string;
  queryPromise?: Promise<unknown>;
  error?: unknown;
};

type RequestsAction = Action<RequestActionPayload | undefined>;

export const setRequestLoading = createAction<
  RequestActionPayload,
  StatePath,
  string | undefined
>(
  "metabase/requests/SET_REQUEST_LOADING",
  (statePath: StatePath, queryKey?: string) => ({
    statePath,
    queryKey,
  }),
);

export const setRequestPromise = createAction<
  RequestActionPayload,
  StatePath,
  string | undefined,
  Promise<unknown>
>(
  "metabase/requests/SET_REQUEST_PROMISE",
  (
    statePath: StatePath,
    queryKey: string | undefined,
    queryPromise: Promise<unknown>,
  ) => ({
    statePath,
    queryKey,
    queryPromise,
  }),
);

export const setRequestLoaded = createAction<
  RequestActionPayload,
  StatePath,
  string | undefined
>(
  "metabase/requests/SET_REQUEST_LOADED",
  (statePath: StatePath, queryKey?: string) => ({
    statePath,
    queryKey,
  }),
);

export const setRequestError = createAction<
  RequestActionPayload,
  StatePath,
  string | undefined,
  unknown
>(
  "metabase/requests/SET_REQUEST_ERROR",
  (statePath: StatePath, queryKey: string | undefined, error: unknown) => ({
    statePath,
    queryKey,
    error,
  }),
);

export const setRequestUnloaded = createAction<RequestActionPayload, StatePath>(
  "metabase/requests/SET_REQUEST_UNLOADED",
  (statePath: StatePath) => ({ statePath }),
);

const initialRequestState: RequestState = {
  loading: false,
  loaded: false,
  fetched: false,
  error: null,
  _isRequestState: true,
};

const requestStateReducer = handleActions<
  RequestState,
  RequestActionPayload | undefined
>(
  {
    [setRequestLoading.toString()]: {
      next: (
        state,
        { payload: { queryKey, queryPromise } = {} }: RequestsAction,
      ) => ({
        ...state,
        queryKey,
        queryPromise,
        loading: true,
        loaded: false,
        error: null,
      }),
    },
    [setRequestPromise.toString()]: {
      next: (
        state,
        { payload: { queryKey, queryPromise } = {} }: RequestsAction,
      ) => ({
        ...state,
        queryKey,
        queryPromise,
      }),
    },
    [setRequestLoaded.toString()]: {
      next: (state, { payload: { queryKey } = {} }: RequestsAction) => ({
        ...state,
        queryKey,
        loading: false,
        loaded: true,
        error: null,
        fetched: true,
      }),
    },
    [setRequestError.toString()]: {
      next: (state, { payload: { queryKey, error } = {} }: RequestsAction) => ({
        ...state,
        queryKey,
        loading: false,
        loaded: false,
        error: error,
      }),
    },
    [setRequestUnloaded.toString()]: {
      next: (state) => ({
        ...state,
        loaded: false,
        error: null,
        queryPromise: null,
      }),
    },
  },
  initialRequestState,
);

function isRequestState(
  state: RequestState | RequestsStateTree,
): state is RequestState {
  return "_isRequestState" in state && !!state._isRequestState;
}

function requestStateReducerRecursive(
  state: RequestState | RequestsStateTree | undefined,
  action: RequestsAction,
): RequestState | RequestsStateTree {
  if (!state || isRequestState(state)) {
    return requestStateReducer(state, action);
  } else {
    let newState = state;
    for (const [key, subState] of Object.entries(state)) {
      newState = assoc(
        newState,
        key,
        requestStateReducerRecursive(subState, action),
      );
    }

    return newState;
  }
}

const isBulkInvalidation = (statePath: (string | number)[]): boolean => {
  // Bulk invalidations only have a statePath with a length of 2
  return statePath.length <= 2;
};

export const requestsReducer = (
  state: RequestsStateTree,
  action: RequestsAction,
): RequestsStateTree => {
  if (action?.payload?.statePath) {
    const statePath = action.payload.statePath;
    const hasStateToUpdate = !!getIn(state, statePath);

    if (hasStateToUpdate || !isBulkInvalidation(statePath)) {
      state = updateIn(state, statePath, (subState: RequestState | undefined) =>
        requestStateReducerRecursive(subState, action),
      );
    }
  }
  return state;
};
