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

type RequestsState = Record<string, unknown> & {
  statePath?: (string | number)[];
  queryKey?: string;
  queryPromise?: Promise<unknown>;
};
type RequestsAction<Type extends string = string> = Partial<
  Action<RequestsState>
> & {
  type: Type;
};

export const setRequestLoading = createAction<
  RequestsAction["payload"],
  RequestsState["statePath"],
  string | undefined
>(
  "metabase/requests/SET_REQUEST_LOADING",
  (statePath: RequestsState["statePath"], queryKey?: string) => ({
    statePath,
    queryKey,
  }),
);

export const setRequestPromise = createAction<
  RequestsAction["payload"],
  RequestsState["statePath"],
  string | undefined,
  Promise<unknown>
>(
  "metabase/requests/SET_REQUEST_PROMISE",
  (
    statePath: RequestsState["statePath"],
    queryKey: string | undefined,
    queryPromise: Promise<unknown>,
  ) => ({
    statePath,
    queryKey,
    queryPromise,
  }),
);

export const setRequestLoaded = createAction<
  RequestsAction["payload"],
  RequestsState["statePath"],
  string | undefined
>(
  "metabase/requests/SET_REQUEST_LOADED",
  (statePath: RequestsState["statePath"], queryKey?: string) => ({
    statePath,
    queryKey,
  }),
);

export const setRequestError = createAction<
  RequestsAction["payload"],
  RequestsState["statePath"],
  string | undefined,
  unknown
>(
  "metabase/requests/SET_REQUEST_ERROR",
  (
    statePath: RequestsState["statePath"],
    queryKey: string | undefined,
    error: unknown,
  ) => ({ statePath, queryKey, error }),
);

export const setRequestUnloaded = createAction<
  RequestsAction["payload"],
  RequestsState["statePath"]
>(
  "metabase/requests/SET_REQUEST_UNLOADED",
  (statePath: RequestsState["statePath"]) => ({ statePath }),
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
  RequestsState | undefined
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

function requestStateReducerRecursive(
  state: RequestState | undefined,
  action: Action<RequestsState | undefined>,
): RequestState {
  if (!state || state._isRequestState) {
    return requestStateReducer(state, action);
  } else {
    let newState = state;
    for (const [key, subState] of Object.entries(state)) {
      newState = assoc(
        newState,
        key,
        requestStateReducerRecursive(subState as RequestState, action),
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
  state: RequestsState = {},
  action: Action<RequestsState | undefined>,
): RequestsState => {
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
