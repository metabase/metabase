import type {
  AnyAction,
  Reducer,
  Store,
  ThunkDispatch,
} from "@reduxjs/toolkit";
import { useDispatch } from "react-redux";

import type { SdkStoreState } from "embedding-sdk/store/types";
import { mainReducers } from "metabase/reducers-main";
import { getStore } from "metabase/store";

import { sdk } from "./reducer";

export const sdkReducers = {
  ...mainReducers,
  sdk,
} as unknown as Record<string, Reducer>;

export const store = getStore(sdkReducers, null, {
  embed: {
    isEmbeddingSdk: true,
  },
  app: {
    isDndAvailable: false,
  },
}) as unknown as Store<SdkStoreState, AnyAction>;

export const useSdkDispatch: () => ThunkDispatch<
  SdkStoreState,
  void,
  AnyAction
> = useDispatch;

export { useSdkSelector } from "./use-sdk-selector";
