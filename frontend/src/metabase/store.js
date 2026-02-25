import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { routerMiddleware, routerReducer as routing } from "react-router-redux";

import { Api } from "metabase/api";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";
import { locationChanged } from "metabase/redux/app";

function createRouterSyncMiddleware(history) {
  const rrMiddleware = routerMiddleware(history);

  return (store) => (next) => (action) => {
    const result = rrMiddleware(store)(next)(action);

    if (action.type === "@@router/LOCATION_CHANGE" && action.payload) {
      store.dispatch(locationChanged(action.payload));
    }

    return result;
  };
}

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
        ...(history ? [createRouterSyncMiddleware(history)] : []),
        ...PLUGIN_REDUX_MIDDLEWARES,
      ]),
  });
}
