import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { routerReducer as routing, routerMiddleware } from "react-router-redux";
import promise from "redux-promise";

import { Api } from "metabase/api";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";
import { CubeApi } from "./api/cubeApi";
import { initialMessageReducer } from "./redux/initialMessage";
import { databaseReducer } from "./redux/initialDb";
import { initialSchemaReducer } from "./redux/initialSchema";

export function getStore(reducers, history, intialState) {
  const reducer = combineReducers({
    ...reducers,
    routing,
    [Api.reducerPath]: Api.reducer,
    [CubeApi.reducerPath]: CubeApi.reducer,
    initialMessage: initialMessageReducer,
    database: databaseReducer,
    initialSchema: initialSchemaReducer
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
        Api.middleware,
        CubeApi.middleware,
        ...(history ? [routerMiddleware(history)] : []),
        ...PLUGIN_REDUX_MIDDLEWARES,
      ]),
  });
}
