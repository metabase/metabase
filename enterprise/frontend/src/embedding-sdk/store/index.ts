import type { AnyAction, Store, ThunkDispatch } from "@reduxjs/toolkit";
import { createMemoryHistory } from "history";
import type { TypedUseSelectorHook } from "react-redux";
import { useDispatch, useSelector } from "react-redux";
import { useRouterHistory } from "react-router";
import { syncHistoryWithStore } from "react-router-redux";

import type { SdkStoreState } from "embedding-sdk/store/types";
import reducers from "metabase/reducers-main";
import { getStore } from "metabase/store";

import { sdk } from "./reducer";

const SDK_REDUCERS = {
  ...reducers,
  sdk,
};

// eslint-disable-next-line react-hooks/rules-of-hooks
const memoryHistory = useRouterHistory(createMemoryHistory)();
export const store = getStore(SDK_REDUCERS, memoryHistory, {
  embed: {
    isEmbeddingSdk: true,
  },
}) as unknown as Store<SdkStoreState, AnyAction>;
export const history = syncHistoryWithStore(memoryHistory, store);

export const useSdkSelector: TypedUseSelectorHook<SdkStoreState> = useSelector;
export const useSdkDispatch: () => ThunkDispatch<
  SdkStoreState,
  void,
  AnyAction
> = useDispatch;
