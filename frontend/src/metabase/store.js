import { combineReducers, configureStore } from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";
import { routerMiddleware } from "metabase/router";

export function getStore(
  reducers,
  history,
  initialState,
  extraMiddlewares = [],
) {
  const reducer = combineReducers({
    ...reducers,
    [Api.reducerPath]: Api.reducer,
  });

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
