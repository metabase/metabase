import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { routerMiddleware, routerReducer as routing } from "react-router-redux";

import { peopleListenerMiddleware } from "metabase/admin/people/people-listener-middleware";
import { Api } from "metabase/api";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";
import { userListenerMiddleware } from "metabase/redux/user-listener-middleware";

export function getStore(reducers, history, initialState) {
  const reducer = combineReducers({
    ...reducers,
    routing,
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
        userListenerMiddleware.middleware,
        peopleListenerMiddleware.middleware,
        ...(history ? [routerMiddleware(history)] : []),
        ...PLUGIN_REDUX_MIDDLEWARES,
      ]),
  });
}
