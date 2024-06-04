import type {
  AnyAction,
  Reducer,
  Store,
  ThunkDispatch,
} from "@reduxjs/toolkit";
import type { TypedUseSelectorHook } from "react-redux";
import { useSelector, useDispatch } from "react-redux";

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
}) as unknown as Store<SdkStoreState, AnyAction>;

export const useSdkSelector: TypedUseSelectorHook<SdkStoreState> = useSelector;
export const useSdkDispatch: () => ThunkDispatch<
  SdkStoreState,
  void,
  AnyAction
> = useDispatch;
