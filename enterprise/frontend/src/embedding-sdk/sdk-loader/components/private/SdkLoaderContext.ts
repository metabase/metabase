import type { Action, Store } from "@reduxjs/toolkit";
import { createContext } from "react";

import type { SdkStoreState } from "embedding-sdk/store/types";

export type SdkLoaderContextType = {
  store: Store<SdkStoreState, Action>
}

export const SdkLoaderContext = createContext({} as unknown)
