import type {
  AnyAction,
  Reducer,
  Store,
  ThunkDispatch,
} from "@reduxjs/toolkit";
import { useContext } from "react";
import {
  ReactReduxContext,
  type TypedUseSelectorHook,
  useSelector,
  useDispatch,
} from "react-redux";

import { USE_OUTSIDE_OF_CONTEXT_MESSAGE } from "embedding-sdk";
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

export const useSdkSelector: TypedUseSelectorHook<SdkStoreState> = (
  selector,
  options,
) => {
  const context = useContext(ReactReduxContext);

  if (!context) {
    throw new Error(USE_OUTSIDE_OF_CONTEXT_MESSAGE);
  }

  return useSelector(selector, options);
};

export const useSdkDispatch: () => ThunkDispatch<
  SdkStoreState,
  void,
  AnyAction
> = useDispatch;
