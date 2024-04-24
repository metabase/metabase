import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { routerReducer as routing, routerMiddleware } from "react-router-redux";
import promise from "redux-promise";

import { Api } from "metabase/api";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";

const logger = store => next => action => {
  // eslint-disable-next-line no-console
  console.debug("dispatching", action);
  const result = next(action);
  // eslint-disable-next-line no-console
  console.debug("next state", store.getState());
  return result;
};

export function getStore(reducers, history, intialState) {
  const reducer = combineReducers({
    ...reducers,
    routing,
    [Api.reducerPath]: Api.reducer,
  });

  return configureStore({
    reducer,
    preloadedState: intialState,
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      }).concat([
        logger,
        promise,
        Api.middleware,
        ...(history ? [routerMiddleware(history)] : []),
        ...PLUGIN_REDUX_MIDDLEWARES,
      ]),
  });
}
