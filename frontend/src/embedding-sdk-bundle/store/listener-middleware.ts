import {
  type TypedStartListening,
  createListenerMiddleware,
} from "@reduxjs/toolkit";

import type { SdkDispatch, SdkStoreState } from "./types";

/**
 * Used by parameter-change emit pipelines to fire `source: 'initial-state'`
 * exactly once per `fetchDashboard.fulfilled`
 */
export const sdkListenerMiddleware = createListenerMiddleware();

export type SdkStartListening = TypedStartListening<SdkStoreState, SdkDispatch>;

export const startSdkListening =
  sdkListenerMiddleware.startListening as SdkStartListening;
