import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { routerReducer as routing, routerMiddleware } from "react-router-redux";
import promise from "redux-promise";

import { Api } from "metabase/api";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";
import { CubeApi } from "./api/cubeApi";
import { CheckpointsApi } from "./api/checkpointsApi";
import { FeedbackApi } from "./api/feedbackApi";

export function getStore(reducers, history, intialState) {
  const reducer = combineReducers({
    ...reducers,
    routing,
    [Api.reducerPath]: Api.reducer,
    [CubeApi.reducerPath]: CubeApi.reducer,
    [CheckpointsApi.reducerPath]: CheckpointsApi.reducer,
    [FeedbackApi.reducerPath]: FeedbackApi.reducer,
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
        CheckpointsApi.middleware,
        FeedbackApi.middleware,
        ...(history ? [routerMiddleware(history)] : []),
        ...PLUGIN_REDUX_MIDDLEWARES,
      ]),
  });
}
