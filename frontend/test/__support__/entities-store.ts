import type { Middleware, Reducer } from "@reduxjs/toolkit";
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import type { Action } from "redux-actions";

import * as entities from "metabase/redux/entities";
import { requestsReducer } from "metabase/redux/requests";
import type { State } from "metabase/redux/store";

/**
 * Map of slice name to its reducer. Reducer state types are unconstrained so that
 * RTK Query reducers (which use `CombinedState`) and standard slice reducers can both
 * be passed here.
 */

type ReducersMap = Record<string, Reducer<any, any, any>>;

/**
 * Build a configured Redux store for tests. The returned store's state is typed as `State`
 * so that selectors and dispatched actions work without further casting in tests.
 */
export function getStore(
  reducers: ReducersMap = {},
  initialState: Partial<State> = {},
  middleware: Middleware[] = [],
) {
  const reducer = combineReducers({
    entities: entities.reducer,
    requests: (
      state: Record<string, unknown> | undefined,
      action: Action<undefined>,
    ) => requestsReducer(entities.requestsReducer(state, action), action),
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
