import { compose } from "@reduxjs/toolkit";
import { getIn } from "icepick";
import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { normalize } from "normalizr";
import _ from "underscore";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import { delay } from "metabase/lib/promise";
import {
  setRequestLoading,
  setRequestLoaded,
  setRequestError,
  setRequestUnloaded,
  setRequestPromise,
} from "metabase/redux/requests";

// convenience
export { combineReducers, compose } from "@reduxjs/toolkit";
export { handleActions, createAction } from "redux-actions";

// turns string timestamps into moment objects
export function momentifyTimestamps(
  object,
  keys = ["created_at", "updated_at"],
) {
  object = { ...object };
  for (const timestamp of keys) {
    if (object[timestamp]) {
      object[timestamp] = moment(object[timestamp]);
    }
  }
  return object;
}

export function momentifyObjectsTimestamps(objects, keys) {
  return _.mapObject(objects, o => momentifyTimestamps(o, keys));
}

export function momentifyArraysTimestamps(array, keys) {
  return _.map(array, o => momentifyTimestamps(o, keys));
}

// turns into id indexed map
export const resourceListToMap = resources =>
  resources.reduce(
    (map, resource) => ({ ...map, [resource.id]: resource }),
    {},
  );

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
}) => {
  const existingData = getIn(getState(), existingStatePath);

  // short circuit if we have loaded data, and we're givein a list of required properties, and they all existing in the loaded data
  if (
    !reload &&
    existingData &&
    properties &&
    _.all(properties, p => existingData[p] !== undefined)
  ) {
    return existingData;
  }

  const statePath = requestStatePath.concat(["fetch"]);
  try {
    const requestState = getIn(getState(), ["requests", ...statePath]);
    if (!requestState || requestState.error || reload) {
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

// DEPRECATED
export const updateData = async ({
  dispatch,
  getState,
  requestStatePath,
  existingStatePath,
  queryKey,
  // specify any request paths that need to be invalidated after this update
  dependentRequestStatePaths,
  putData,
}) => {
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

    (dependentRequestStatePaths || []).forEach(statePath =>
      dispatch(setRequestUnloaded(statePath)),
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
export function mergeEntities(entities, newEntities) {
  entities = { ...entities };
  for (const id in newEntities) {
    if (newEntities[id] === null) {
      delete entities[id];
    } else {
      entities[id] = { ...entities[id], ...newEntities[id] };
    }
  }
  return entities;
}

// helper for working with normalizr
// reducer that merges payload.entities
export function handleEntities(
  actionPattern,
  entityType,
  reducer = (state = {}, action) => state,
) {
  return (state, action) => {
    if (state === undefined) {
      state = {};
    }
    const entities = getIn(action, ["payload", "entities", entityType]);
    if (actionPattern.test(action.type) && entities) {
      state = mergeEntities(state, entities);
    }
    return reducer(state, action);
  };
}

// for filtering non-DOM props from redux-form field objects
// https://github.com/erikras/redux-form/issues/1441
export const formDomOnlyProps = ({
  initialValue,
  autofill,
  onUpdate,
  valid,
  invalid,
  dirty,
  pristine,
  active,
  touched,
  visited,
  autofilled,
  error,
  defaultValue,
  ...domProps
}) => domProps;

// THUNK DECORATORS

/**
 * Decorator for turning a payload creator or thunk (including one returning a promise) into a flux standard action
 */
export function withAction(actionType) {
  return payloadOrThunkCreator => {
    function newCreator(...args) {
      const payloadOrThunk = payloadOrThunkCreator(...args);
      if (typeof payloadOrThunk === "function") {
        // thunk, return a new thunk
        return async (dispatch, getState) => {
          try {
            const payload = await payloadOrThunk(dispatch, getState);
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
export function withRequestState(getRequestStatePath, getQueryKey) {
  // thunk decorator:
  return thunkCreator =>
    // thunk creator:
    (...args) =>
    // thunk:
    async (dispatch, getState) => {
      const statePath = getRequestStatePath(...args);
      const queryKey = getQueryKey && getQueryKey(...args);
      try {
        dispatch(setRequestLoading(statePath, queryKey));

        const queryPromise = thunkCreator(...args)(dispatch, getState);
        dispatch(setRequestPromise(statePath, queryKey, queryPromise));

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
export function withCachedDataAndRequestState(
  getExistingStatePath,
  getRequestStatePath,
  getQueryKey,
) {
  return compose(
    withCachedData(getExistingStatePath, getRequestStatePath, getQueryKey),
    withRequestState(getRequestStatePath, getQueryKey),
  );
}

// NOTE: this should be used together with withRequestState, probably via withCachedDataAndRequestState
function withCachedData(
  getExistingStatePath,
  getRequestStatePath,
  getQueryKey,
) {
  // thunk decorator:
  return thunkCreator =>
    // thunk creator:
    (...args) =>
      // thunk:
      async function thunk(dispatch, getState) {
        const options = args[args.length - 1] || {};
        const { useCachedForbiddenError, reload, properties } = options;

        const existingStatePath = getExistingStatePath(...args);
        const requestStatePath = ["requests", ...getRequestStatePath(...args)];
        const newQueryKey = getQueryKey && getQueryKey(...args);
        const existingData = getIn(getState(), existingStatePath);
        const { loading, loaded, queryKey, error } =
          getIn(getState(), requestStatePath) || {};

        // Avoid requesting data with permanently forbidden access
        if (useCachedForbiddenError && error?.status === 403) {
          throw error;
        }

        const hasRequestedProperties =
          properties &&
          existingData &&
          _.all(properties, p => existingData[p] !== undefined);

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
            const queryPromise = getIn(
              getState(),
              requestStatePath,
            )?.queryPromise;

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

export function withAnalytics(categoryOrFn, actionOrFn, labelOrFn, valueOrFn) {
  // thunk decorator:
  return thunkCreator =>
    // thunk creator:
    (...args) =>
    // thunk:
    (dispatch, getState) => {
      function get(valueOrFn, extra = {}) {
        if (typeof valueOrFn === "function") {
          return valueOrFn(args, { ...extra }, getState);
        }
      }
      try {
        const category = get(categoryOrFn);
        const action = get(actionOrFn, { category });
        const label = get(labelOrFn, { category, action });
        const value = get(valueOrFn, { category, action, label });
        MetabaseAnalytics.trackStructEvent(category, action, label, value);
      } catch (error) {
        console.warn("withAnalytics threw an error:", error);
      }
      return thunkCreator(...args)(dispatch, getState);
    };
}

export function withNormalize(schema) {
  return thunkCreator =>
    (...args) =>
    async (dispatch, getState) =>
      normalize(await thunkCreator(...args)(dispatch, getState), schema);
}
