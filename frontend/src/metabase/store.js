import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { routerReducer as routing, routerMiddleware } from "react-router-redux";
import promise from "redux-promise";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";

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
        ...(history ? [routerMiddleware(history)] : []),
        ...PLUGIN_REDUX_MIDDLEWARES,
      ]),
  });
}
