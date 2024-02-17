import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { setAutoFreeze } from "immer";
import { routerReducer as routing, routerMiddleware } from "react-router-redux";
import promise from "redux-promise";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";

/**
 * MLv2 modifies passed values and adds a new property for caching objects
 * to speed up calculations. RTK uses immer under the hood and freezes
 * state automatically, which leads to the error on cljs side.
 * As a workaround, we disable immer's auto-freeze
 */
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
