import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { connectRouter, routerMiddleware } from "connected-react-router";
import promise from "redux-promise";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";

export function getStore(reducers, history, intialState) {
  const reducer = combineReducers({
    ...reducers,
    router: connectRouter(history),
  });

  return configureStore({
    reducer,
    preloadedState: intialState,
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      }).concat([
        promise,
        ...(history ? [routerMiddleware(history)] : []),
        ...PLUGIN_REDUX_MIDDLEWARES,
      ]),
  });
}
