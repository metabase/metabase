import type { Action, Store } from "@reduxjs/toolkit";

import type { SdkStoreState } from "embedding-sdk/store/types";

export type StoreWithSdkState = Store<SdkStoreState, Action>;
