import {
  type Reducer,
  type StateFromReducersMapObject,
  combineReducers,
} from "@reduxjs/toolkit";
import { useContext } from "react";

import * as pulse from "metabase/notifications/pulse/reducers";
import { queryBuilderReducer } from "metabase/query_builder";
import { commonReducers } from "metabase/reducers-common";
import { metabaseReduxContext, useDispatch, useStore } from "metabase/redux";
import { DEFAULT_EMBEDDING_ENTITY_TYPES } from "metabase/redux/embedding-data-picker";
import { getStore } from "metabase/store";
import { reducer as visualizer } from "metabase/visualizer/visualizer.slice";

import { sdkListenerMiddleware } from "./listener-middleware";
import { sdk } from "./reducer";
import type { SdkDispatch, SdkStore } from "./types";

const sdkReducerMap = {
  ...commonReducers,
  pulse: combineReducers(pulse),
  qb: queryBuilderReducer,
  visualizer,
  sdk,
};

/**
 * The SDK's state, derived from the slices this root composes.
 */
export type SdkState = StateFromReducersMapObject<typeof sdkReducerMap>;

// Unjustified type cast. FIXME
export const sdkReducers = sdkReducerMap as unknown as Record<string, Reducer>;

export const getSdkStore = () =>
  // Unjustified type cast. FIXME
  getStore(
    sdkReducers,
    {
      embed: {
        options: {
          entity_types: DEFAULT_EMBEDDING_ENTITY_TYPES,
        },
      },
      app: {
        isDndAvailable: false,
      },
    },
    [sdkListenerMiddleware.middleware],
  ) as unknown as SdkStore;

export const useSdkDispatch = () => {
  useCheckSdkReduxContext();

  // Unjustified type cast. FIXME
  return useDispatch() as SdkDispatch;
};

export const useSdkStore = () => {
  useCheckSdkReduxContext();

  // Unjustified type cast. FIXME
  return useStore() as SdkStore;
};

const useCheckSdkReduxContext = () => {
  const context = useContext(metabaseReduxContext);

  if (!context) {
    console.warn(
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- not UI string
      "Cannot find react-redux context. Make sure component or hook is wrapped into MetabaseProvider",
    );
  }
};

export { useSdkSelector } from "./use-sdk-selector";
