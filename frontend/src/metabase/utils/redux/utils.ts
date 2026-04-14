import type { Reducer, UnknownAction } from "@reduxjs/toolkit";
import { compose } from "@reduxjs/toolkit";
import { getIn } from "icepick";
import { type Schema, normalize } from "normalizr";
import _ from "underscore";

import {
  setRequestError,
  setRequestLoaded,
  setRequestLoading,
  setRequestPromise,
  setRequestUnloaded,
} from "metabase/redux/requests";
import type { Dispatch, State } from "metabase/redux/store";
import { delay } from "metabase/utils/promise";

// convenience
export { combineReducers, compose } from "@reduxjs/toolkit";
export { handleActions, createAction } from "redux-actions";

// turns into id indexed map
export const resourceListToMap = <T extends { id: string | number }>(
  resources: T[],
): Record<string | number, T> =>
  resources.reduce(
    (map, resource) => ({ ...map, [resource.id]: resource }),
    {} as Record<string | number, T>,
  );

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
    _.all(
      properties,
      (p: string) => (existingData as Record<string, unknown>)[p] !== undefined,
    )
  ) {
    return existingData;
  }

  const statePath = requestStatePath.concat(["fetch"]);
  try {
    const requestState = getIn(getState(), ["requests", ...statePath]);
    if (
      !requestState ||
      (requestState as { error?: unknown }).error ||
      reload
    ) {
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

// helper for working with normalizr
// merge each entity from newEntities with existing entity, if any
// this ensures partial entities don't overwrite existing entities with more properties
export function mergeEntities(
  entities: Record<string, unknown>,
  newEntities: Record<string, Record<string, unknown> | null | undefined>,
): Record<string, Record<string, unknown>> {
  const result = { ...entities } as Record<string, Record<string, unknown>>;
  for (const id in newEntities) {
    if (newEntities[id] == null) {
      delete result[id];
    } else {
      result[id] = {
        ...(result[id] ?? {}),
        ...(newEntities[id] as Record<string, unknown>),
      };
    }
  }
  return result;
}

// helper for working with normalizr
// reducer that merges payload.entities
export function handleEntities(
  actionPattern: RegExp,
  entityType: string,
  reducer: Reducer<Record<string, unknown>> = (state = {}) => state,
): Reducer<Record<string, unknown>> {
  return (state = {}, action: UnknownAction) => {
    const entities = getIn(action as object, [
      "payload",
      "entities",
      entityType,
    ]) as Record<string, Record<string, unknown>> | undefined;
    if (actionPattern.test(action.type) && entities) {
      state = mergeEntities(state, entities);
    }
    return reducer(state, action);
  };
}

// THUNK DECORATORS

type Thunk<R = unknown> = (
  dispatch: Dispatch,
  getState: () => State,
) => Promise<R> | R;

type ThunkCreator<TArgs extends unknown[], R = unknown> = (
  ...args: TArgs
) => Thunk<R>;

type PayloadOrThunkCreator<TArgs extends unknown[], R = unknown> = (
  ...args: TArgs
) => R | Thunk<R>;

/**
 * Decorator for turning a payload creator or thunk (including one returning a promise) into a flux standard action
 */
export function withAction<TArgs extends unknown[]>(actionType: string) {
  return (payloadOrThunkCreator: PayloadOrThunkCreator<TArgs>) => {
    function newCreator(...args: TArgs): unknown {
      const payloadOrThunk = payloadOrThunkCreator(...args);
      if (typeof payloadOrThunk === "function") {
        // thunk, return a new thunk
        return async (dispatch: Dispatch, getState: () => State) => {
          try {
            const payload = await (payloadOrThunk as Thunk)(dispatch, getState);
            const dispatchValue = { type: actionType, payload: payload };
            dispatch(dispatchValue);

            return dispatchValue;
          } catch (error) {
            dispatch({ type: actionType, payload: error, error: true });
            throw error;
          }
        };
      } else {
        // payload, return an action
        return { type: actionType, payload: payloadOrThunk };
      }
    }
    newCreator.toString = () => actionType;
    return newCreator;
  };
}

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

/**
 * Decorator that returns cached data if appropriate, otherwise calls the composed thunk.
 * Also tracks request state using withRequestState
 */
export function withCachedDataAndRequestState<TArgs extends unknown[]>(
  getExistingStatePath: (...args: TArgs) => string[],
  getRequestStatePath: (...args: TArgs) => string[],
  getQueryKey?: (...args: TArgs) => string | undefined,
) {
  return compose(
    withCachedData(getExistingStatePath, getRequestStatePath, getQueryKey),
    withRequestState(getRequestStatePath, getQueryKey),
  );
}

type CachedRequestState = {
  loading?: boolean;
  loaded?: boolean;
  queryKey?: string;
  error?: { status?: number };
  queryPromise?: Promise<unknown>;
};

type CachedOptions = {
  useCachedForbiddenError?: boolean;
  reload?: boolean | (() => void);
  properties?: string[];
};

// NOTE: this should be used together with withRequestState, probably via withCachedDataAndRequestState
function withCachedData<TArgs extends unknown[]>(
  getExistingStatePath: (...args: TArgs) => string[],
  getRequestStatePath: (...args: TArgs) => string[],
  getQueryKey?: (...args: TArgs) => string | undefined,
) {
  // thunk decorator:
  return (thunkCreator: ThunkCreator<TArgs>) =>
    // thunk creator:
    (...args: TArgs) =>
      // thunk:
      async function thunk(
        dispatch: Dispatch,
        getState: () => State,
      ): Promise<unknown> {
        const options = (args[args.length - 1] as CachedOptions) || {};
        const { useCachedForbiddenError, reload, properties } = options;

        const existingStatePath = getExistingStatePath(...args);
        const requestStatePath = ["requests", ...getRequestStatePath(...args)];
        const newQueryKey = getQueryKey && getQueryKey(...args);
        const existingData = getIn(getState(), existingStatePath);
        const { loading, loaded, queryKey, error } =
          (getIn(getState(), requestStatePath) as CachedRequestState) || {};

        // Avoid requesting data with permanently forbidden access
        if (useCachedForbiddenError && error?.status === 403) {
          throw error;
        }

        const hasRequestedProperties =
          properties &&
          existingData &&
          _.all(
            properties,
            (p: string) =>
              (existingData as Record<string, unknown>)[p] !== undefined,
          );

        // return existing data if
        if (
          // we don't want to reload
          // the check is a workaround for EntityListLoader passing reload function to children
          reload !== true &&
          // reload if the query used to load an entity has changed even if it's already loaded
          newQueryKey === queryKey
        ) {
          // and we have a non-error request state or have a list of properties that all exist on the object
          if (loaded || hasRequestedProperties) {
            return existingData;
          } else if (loading) {
            const requestState = getIn(getState(), requestStatePath) as
              | CachedRequestState
              | undefined;
            const queryPromise = requestState?.queryPromise;

            if (queryPromise) {
              // wait for current loading request to be resolved
              await queryPromise;

              // need to wait for next tick to allow loaded request data to be processed and avoid loops
              await delay(0);

              // retry this function after waited request gets resolved
              return thunk(dispatch, getState);
            }

            return existingData;
          }
        }

        return thunkCreator(...args)(dispatch, getState);
      };
}

export function withNormalize<TArgs extends unknown[]>(schema: Schema) {
  return (thunkCreator: ThunkCreator<TArgs>) =>
    (...args: TArgs) =>
    async (dispatch: Dispatch, getState: () => State) =>
      normalize(await thunkCreator(...args)(dispatch, getState), schema);
}
