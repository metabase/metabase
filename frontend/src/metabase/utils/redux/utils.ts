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
