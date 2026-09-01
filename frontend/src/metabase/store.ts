import {
  type Middleware,
  type Reducer,
  type ReducersMapObject,
  combineReducers,
  configureStore,
} from "@reduxjs/toolkit";

import { Api, retryDroppedRefetches } from "metabase/api";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";
import { metadataHydrationMiddleware } from "metabase/redux/entities/hydration";
import type { State } from "metabase/redux/store";

// Each app passes its own reducer map, so per-slice types can't be known here.
type AnySliceReducer = Reducer<any, any>;

export function getStore(
  reducers: Record<string, AnySliceReducer>,
  initialState?: Partial<State> | Record<string, unknown>,
  extraMiddlewares: Middleware[] = [],
) {
  // Public/embed/SDK entries pass a subset of the slices, so this overstates
  // their state; `app.tsx` only reads slices common to every map.
  const reducerMap = {
    ...reducers,
    [Api.reducerPath]: Api.reducer,
  } as ReducersMapObject<State>;

  const middlewares: Middleware[] = [
    Api.middleware,
    retryDroppedRefetches,
    metadataHydrationMiddleware,
    ...PLUGIN_REDUX_MIDDLEWARES,
    ...extraMiddlewares,
  ];

  return configureStore({
    reducer: combineReducers(reducerMap),
    preloadedState: initialState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        immutableCheck: false,
        serializableCheck: false,
      }).concat(middlewares),
  });
}
