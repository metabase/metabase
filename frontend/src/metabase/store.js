import { combineReducers, configureStore } from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";

export function getStore(reducers, _history, initialState) {
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
      }).concat([Api.middleware, ...PLUGIN_REDUX_MIDDLEWARES]),
  });
}
