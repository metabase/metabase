import type { AnyAction, Store, ThunkDispatch } from "@reduxjs/toolkit";
import type { TypedUseSelectorHook } from "react-redux";
import { useSelector, useDispatch } from "react-redux";

import type { SdkStoreState } from "embedding-sdk/store/types";
import reducers from "metabase/reducers-main";
import { getStore } from "metabase/store";

import { sdk } from "./reducer";

const SDK_REDUCERS = {
  ...reducers,
  sdk,
};

export const store = getStore(SDK_REDUCERS, null, {
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
