import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { routerReducer as routing } from "react-router-redux";
import promise from "redux-promise";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";
import { getRouterMiddleware } from "metabase/redux/middleware";

export function getStore(reducers, history, intialState) {
  const reducer = combineReducers({
    ...reducers,
    routing,
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
        ...getRouterMiddleware(history),
        ...PLUGIN_REDUX_MIDDLEWARES,
      ]),
  });
}
