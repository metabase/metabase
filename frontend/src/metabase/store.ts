import type {
  Middleware,
  Reducer,
  Store,
  UnknownAction,
} from "@reduxjs/toolkit";
import { combineReducers, configureStore } from "@reduxjs/toolkit";
import type { History } from "history";

import { Api } from "metabase/api";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { routerMiddleware, routing } from "metabase/router";

export function getStore(
  // the reducer map and preloaded state vary per app entry point (main,
  // public, embed, SDK), so their shapes are consciously loose
  reducers: Record<string, Reducer<any, any, any>>,
  history?: History | null,
  initialState?: unknown,
  extraMiddlewares: Middleware[] = [],
): Store<State> {
  // assert the app-level State since the true shape depends on the caller's
  // reducer map; the unknown preloaded-state generic accepts entry points'
  // partial initial state
  const reducer = combineReducers({
    ...reducers,
    routing,
    [Api.reducerPath]: Api.reducer,
  }) as unknown as Reducer<State, UnknownAction, unknown>;

  return configureStore({
    reducer,
    preloadedState: initialState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      }).concat([
        Api.middleware,
        ...(history ? [routerMiddleware(history)] : []),
        ...PLUGIN_REDUX_MIDDLEWARES,
        ...extraMiddlewares,
      ]),
  });
}
