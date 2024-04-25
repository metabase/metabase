import { combineReducers, configureStore } from "@reduxjs/toolkit";
import promise from "redux-promise";

import * as entities from "metabase/redux/entities";
import requestsReducer from "metabase/redux/requests";

export function getStore(reducers = {}, initialState = {}, middleware = []) {
  const reducer = combineReducers({
    entities: entities.reducer,
    requests: (state, action) =>
      requestsReducer(entities.requestsReducer(state, action), action),
    ...reducers,
  });

  return configureStore({
    reducer,
    preloadedState: initialState,
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      }).concat([promise, ...middleware]),
  });
}
