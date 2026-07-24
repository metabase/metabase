import {
  type Middleware,
  type Reducer,
  combineReducers,
  configureStore,
} from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import {
  type RouterNavigator,
  routerMiddleware,
  routing,
} from "metabase/router";

export function getStore(
  reducers: Record<string, Reducer<any, any, any>>,
  navigator?: RouterNavigator | null,
  initialState?: Partial<State> | Record<string, unknown>,
  extraMiddlewares: Middleware[] = [],
) {
  // The slice map is dynamic (each app passes its own), so the combined state
  // is typed as a plain record rather than one app's State.
  const reducerMap: Record<string, Reducer<any, any, any>> = {
    ...reducers,
    routing,
    [Api.reducerPath]: Api.reducer,
  };

  const middlewares: Middleware[] = [
    Api.middleware,
    ...(navigator ? [routerMiddleware(navigator)] : []),
    ...PLUGIN_REDUX_MIDDLEWARES,
    ...extraMiddlewares,
  ];

  return configureStore({
    reducer: combineReducers(reducerMap),
    preloadedState: initialState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      }).concat(middlewares),
  });
}
