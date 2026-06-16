import type { Middleware, Reducer } from "@reduxjs/toolkit";
import { combineReducers, configureStore } from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import { mainReducers } from "metabase/reducers-main";
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
