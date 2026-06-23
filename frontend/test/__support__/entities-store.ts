import type { Middleware, Reducer } from "@reduxjs/toolkit";
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import _ from "underscore";

import { Api } from "metabase/api";
import { commonReducers } from "metabase/reducers-common";
import { mainReducers } from "metabase/reducers-main";
import { publicReducers } from "metabase/reducers-public";
import { reducer as entitiesReducer } from "metabase/redux/entities";
import type { State } from "metabase/redux/store";
// Re-exported from the test-support tier so specs can build a main-app store
// without importing `metabase/reducers-main` directly, which would
// cross module boundaries. The test-support tier is exempt from those rules.

export { mainReducers };

/**
 * Build a configured Redux store for tests.
 *
 * Typings in this file are consciously loose to support regular and thunk actions
 * of different kinds throughout the codebase, including bizarre assertions in unit tests.
 */
export function getStore(
  reducers: Record<string, Reducer<any, any, any>> = {},
  initialState: Partial<State> = {},
  middleware: Middleware[] = [],
) {
  const reducer = combineReducers({
    entities: entitiesReducer,
    ...reducers,
  }) as unknown as Reducer<State>;

  return configureStore({
    reducer,
    preloadedState: initialState as State,

    middleware: ((getDefaultMiddleware: any) =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      }).concat(middleware)) as never,
  });
}

/**
 * Build a test store wired with the full main-app reducers (including the RTK
 * Query `Api` reducer). Use this instead of importing `mainReducers` from
 * `metabase/reducers-main` into specs.
 */
export function getMainStore(
  initialState: Partial<State> = {},
  middleware: Middleware[] = [Api.middleware],
) {
  return getStore(
    { ...mainReducers, [Api.reducerPath]: Api.reducer },
    initialState,
    middleware,
  );
}

function getManifestStore(
  reducers: Record<string, Reducer<any, any, any>>,
  initialState: Partial<State> = {},
  middleware: Middleware[] = [Api.middleware],
) {
  return getStore(
    reducers,
    _.pick(initialState, ...Object.keys(reducers)) as Partial<State>,
    middleware,
  );
}

/**
 * Build a test/Storybook store wired with the reducers shared between the main
 * and public apps. Use this instead of importing `commonReducers` from
 * `metabase/reducers-common` into stories, which would cross module boundaries.
 */
export function getCommonStore(
  initialState: Partial<State> = {},
  middleware: Middleware[] = [Api.middleware],
) {
  return getManifestStore(commonReducers, initialState, middleware);
}

/**
 * Build a test/Storybook store wired with the public-app reducers. Use this
 * instead of importing `publicReducers` from `metabase/reducers-public` into
 * stories, which would cross module boundaries.
 *
 * `publicReducers` mirrors `commonReducers` today, but stays a distinct entry
 * point so public stories keep their own source of truth.
 */
export function getPublicStore(
  initialState: Partial<State> = {},
  middleware: Middleware[] = [Api.middleware],
) {
  return getManifestStore(publicReducers, initialState, middleware);
}
