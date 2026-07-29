import {
  type Middleware,
  type Reducer,
  combineReducers,
  configureStore,
} from "@reduxjs/toolkit";

import { Api } from "metabase/api";
import { PLUGIN_REDUX_MIDDLEWARES } from "metabase/plugins";
import type { State } from "metabase/redux/store";
import { type RouterNavigator, routerMiddleware } from "metabase/router";

// Each app (main, public, embedding SDK) builds the store from its own reducer
// map, so slice state and action types can't be known here. `unknown` doesn't
// compile: a reducer both takes and returns its state, and only `any` works in
// both directions. Tighten this once the old handleActions reducers move to
// RTK createSlice.
type AnySliceReducer = Reducer<any, any>;

export function getStore(
  reducers: Record<string, AnySliceReducer>,
  navigator?: RouterNavigator | null,
  initialState?: Partial<State> | Record<string, unknown>,
  extraMiddlewares: Middleware[] = [],
) {
  // The slice map is dynamic (each app passes its own), so the combined state
  // is typed as a plain record rather than one app's State.
  const reducerMap: Record<string, AnySliceReducer> = {
    ...reducers,
    [Api.reducerPath]: Api.reducer,
  };

  const middlewares: Middleware[] = [
    Api.middleware,
    ...(navigator ? [routerMiddleware(navigator)] : []),
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
