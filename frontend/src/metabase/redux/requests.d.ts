import type { Action } from "redux";

export type RequestState = {
  loading: boolean;
  loaded: boolean;
  fetched: boolean;
  error: unknown | null;
  queryKey?: string;
  queryPromise?: Promise<unknown> | null;
  _isRequestState: true;
};

type RequestAction<T extends string, P> = Action<T> & { payload: P };

export declare function setRequestLoading(
  statePath: (string | number)[],
  queryKey?: string,
): RequestAction<
  "metabase/requests/SET_REQUEST_LOADING",
  { statePath: (string | number)[]; queryKey?: string }
>;

export declare function setRequestPromise(
  statePath: (string | number)[],
  queryKey: string | undefined,
  queryPromise: Promise<unknown>,
): RequestAction<
  "metabase/requests/SET_REQUEST_PROMISE",
  {
    statePath: (string | number)[];
    queryKey?: string;
    queryPromise: Promise<unknown>;
  }
>;

export declare function setRequestLoaded(
  statePath: (string | number)[],
  queryKey?: string,
): RequestAction<
  "metabase/requests/SET_REQUEST_LOADED",
  { statePath: (string | number)[]; queryKey?: string }
>;

export declare function setRequestError(
  statePath: (string | number)[],
  queryKey: string | undefined,
  error: unknown,
): RequestAction<
  "metabase/requests/SET_REQUEST_ERROR",
  { statePath: (string | number)[]; queryKey?: string; error: unknown }
>;

export declare function setRequestUnloaded(
  statePath: (string | number)[],
): RequestAction<
  "metabase/requests/SET_REQUEST_UNLOADED",
  { statePath: (string | number)[] }
>;

type RequestsState = Record<string, unknown>;

declare const requestsReducer: (
  state: RequestsState | undefined,
  action: Action,
) => RequestsState;

// eslint-disable-next-line import/no-default-export -- requests.js uses default export
export default requestsReducer;
