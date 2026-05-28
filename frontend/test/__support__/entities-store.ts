import type { Middleware, Reducer } from "@reduxjs/toolkit";
import { combineReducers, configureStore } from "@reduxjs/toolkit";

import {
  enhanceRequestsReducer,
  reducer as entitiesReducer,
} from "metabase/redux/entities";
import { requestsReducer } from "metabase/redux/requests";
import type { State } from "metabase/redux/store";

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
    requests: enhanceRequestsReducer(requestsReducer),
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
