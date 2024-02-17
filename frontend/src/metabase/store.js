import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { setAutoFreeze } from "immer";
import { routerReducer as routing, routerMiddleware } from "react-router-redux";
import promise from "redux-promise";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";

setAutoFreeze(false);

export function getStore(reducers, history, initialState) {
  const reducer = combineReducers({
    ...reducers,
    routing,
  });

  return configureStore({
    reducer,
    preloadedState: initialState,
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
