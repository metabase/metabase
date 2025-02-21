/* eslint-disable no-restricted-imports */
import type { AnyAction, Reducer, Store } from "@reduxjs/toolkit";
import { useContext } from "react";

import {
  MetabaseReduxContext,
  useDispatch,
  useStore,
} from "metabase/lib/redux";
import { mainReducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";

import { sdk } from "./reducer";
import type { SdkStoreState } from "./types";

export const sdkReducers = {
  ...mainReducers,
  sdk,
} as unknown as Record<string, Reducer>;

export const getSdkStore = () =>
  getStore(sdkReducers, null, {
    embed: {
      options: {},
      isEmbeddingSdk: true,
    },
    app: {
      isDndAvailable: false,
    },
  }) as unknown as Store<SdkStoreState, AnyAction>;

export const useSdkDispatch = () => {
  useCheckSdkReduxContext();

  return useDispatch();
};

export const useSdkStore = () => {
  useCheckSdkReduxContext();

  return useStore();
};

const useCheckSdkReduxContext = () => {
  const context = useContext(MetabaseReduxContext);

  if (!context) {
    console.warn(
      // eslint-disable-next-line no-literal-metabase-strings -- not UI string
      "Cannot find react-redux context. Make sure component or hook is wrapped into MetabaseProvider",
    );
  }
};

export { useSdkSelector } from "./use-sdk-selector";
