import { getIn } from "icepick";
import _ from "underscore";

import {
  setRequestError,
  setRequestLoaded,
  setRequestLoading,
  setRequestPromise,
  setRequestUnloaded,
} from "metabase/redux/requests";
import type { Dispatch, State } from "metabase/redux/store";

export type FetchDataArgs = {
  dispatch: Dispatch;
  getState: () => State;
  requestStatePath: string[];
  existingStatePath: string[];
  queryKey?: string;
  getData: () => Promise<unknown>;
  reload?: boolean;
  properties?: string[] | null;
};

// DEPRECATED
export const fetchData = async ({
  dispatch,
  getState,
  requestStatePath,
  existingStatePath,
  queryKey,
  getData,
  reload = false,
  properties = null,
}: FetchDataArgs): Promise<unknown> => {
  const existingData = getIn(getState(), existingStatePath);

  // short circuit if we have loaded data, and we're given a list of required properties, and they all exist in the loaded data
  if (
    !reload &&
    existingData &&
    properties &&
    _.all(properties, (p: string) => existingData[p] !== undefined)
  ) {
    return existingData;
  }

  const statePath = requestStatePath.concat(["fetch"]);
  try {
    const requestState = getIn(getState(), ["requests", ...statePath]);
    if (!requestState || requestState?.error || reload) {
      dispatch(setRequestLoading(statePath, queryKey));

      const queryPromise = getData();
      dispatch(setRequestPromise(statePath, queryKey, queryPromise));

      const data = await queryPromise;

      // NOTE Atte Keinänen 8/23/17:
      // Dispatch `setRequestLoaded` after clearing the call stack because we want to the actual data to be updated
      // before we notify components via `state.requests.fetches` that fetching the data is completed
      setTimeout(() => dispatch(setRequestLoaded(statePath, queryKey)));

      return data;
    }

    return existingData;
  } catch (error) {
    dispatch(setRequestError(statePath, queryKey, error));
    console.error("fetchData error", error);
    return existingData;
  }
};

type UpdateDataArgs = {
  dispatch: Dispatch;
  getState: () => State;
  requestStatePath: string[];
  existingStatePath?: string[];
  queryKey?: string;
  dependentRequestStatePaths?: string[][];
  putData: () => Promise<unknown>;
};

// DEPRECATED
export const updateData = async ({
  dispatch,
  getState,
  requestStatePath,
  existingStatePath,
  queryKey,
  dependentRequestStatePaths,
  putData,
}: UpdateDataArgs): Promise<unknown> => {
  const existingData = existingStatePath
    ? getIn(getState(), existingStatePath)
    : null;
  const statePath = requestStatePath.concat(["update"]);
  try {
    dispatch(setRequestLoading(statePath, queryKey));

    const queryPromise = putData();
    dispatch(setRequestPromise(statePath, queryKey, queryPromise));

    const data = await queryPromise;
    dispatch(setRequestLoaded(statePath, queryKey));

    (dependentRequestStatePaths || []).forEach((path) =>
      dispatch(setRequestUnloaded(path)),
    );

    return data;
  } catch (error) {
    dispatch(setRequestError(statePath, queryKey, error));
    console.error(error);
    return existingData;
  }
};

// THUNK DECORATORS

type Thunk<R = unknown> = (
  dispatch: Dispatch,
  getState: () => State,
) => Promise<R> | R;

type ThunkCreator<TArgs extends unknown[], R = unknown> = (
  ...args: TArgs
) => Thunk<R>;

/**
 * Decorator that tracks the state of a request action
 */
export function withRequestState<TArgs extends unknown[]>(
  getRequestStatePath: (...args: TArgs) => string[],
  getQueryKey?: (...args: TArgs) => string | undefined,
) {
  // thunk decorator:
  return (thunkCreator: ThunkCreator<TArgs>) =>
    // thunk creator:
    (...args: TArgs) =>
    // thunk:
    async (dispatch: Dispatch, getState: () => State) => {
      const statePath = getRequestStatePath(...args);
      const queryKey = getQueryKey && getQueryKey(...args);
      try {
        dispatch(setRequestLoading(statePath, queryKey));

        const queryPromise = thunkCreator(...args)(dispatch, getState);
        dispatch(
          setRequestPromise(
            statePath,
            queryKey,
            queryPromise as Promise<unknown>,
          ),
        );

        const result = await queryPromise;

        // Dispatch `setRequestLoaded` after clearing the call stack because
        // we want to the actual data to be updated before we notify
        // components that fetching the data is completed
        setTimeout(() => dispatch(setRequestLoaded(statePath, queryKey)));

        return result;
      } catch (error) {
        console.error(`Request ${statePath.join(",")} failed:`, error);
        dispatch(setRequestError(statePath, queryKey, error));
        throw error;
      }
    };
}
