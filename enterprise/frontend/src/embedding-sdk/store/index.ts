import type {
  AnyAction,
  Reducer,
  Store,
  ThunkDispatch,
} from "@reduxjs/toolkit";
import { merge } from "icepick";
import { useContext } from "react";
import { ReactReduxContext, useDispatch, useStore } from "react-redux";

import type { SdkState, SdkStoreState } from "embedding-sdk/store/types";
import type { SDKConfig } from "embedding-sdk/types";
import { mainReducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";

import { sdk, sdkInitialState } from "./reducer";

export const sdkReducers = {
  ...mainReducers,
  sdk,
} as unknown as Record<string, Reducer>;

export const getSdkStore = (config: SDKConfig) => {
  const initialState: SdkStoreState = {
    sdk: merge(sdkInitialState, {
      fetchRefreshTokenFn: config.fetchRequestToken ?? null,
      metabaseInstanceUrl: config.metabaseInstanceUrl,
    } as Partial<SdkState>),
    embed: {
      options: {},
      isEmbeddingSdk: true,
    },
    // @ts-expect-error -- TODO: we're not populating all the state here, we should fix it
    app: {
      isDndAvailable: false,
    },
  };
  return getStore(sdkReducers, null, initialState) as unknown as Store<
    SdkStoreState,
    AnyAction
  >;
};
export const useSdkDispatch: () => ThunkDispatch<
  SdkStoreState,
  void,
  AnyAction
> = () => {
  useCheckSdkReduxContext();

  return useDispatch();
};

export const useSdkStore = () => {
  useCheckSdkReduxContext();

  return useStore();
};

const useCheckSdkReduxContext = () => {
  const context = useContext(ReactReduxContext);

  if (!context) {
    console.warn(
      // eslint-disable-next-line no-literal-metabase-strings -- not UI string
      "Cannot find react-redux context. Make sure component or hook is wrapped into MetabaseProvider",
    );
  }
};

export { useSdkSelector } from "./use-sdk-selector";
