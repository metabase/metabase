import {
  type TypedStartListening,
  createListenerMiddleware,
} from "@reduxjs/toolkit";

import type { SdkDispatch, SdkStoreState } from "./types";

type SdkStartListening = TypedStartListening<SdkStoreState, SdkDispatch>;

type SdkListenerOptions = Parameters<typeof startSdkListening>[0];

/** Effect callback: `(action, listenerApi) => void`, runs when the listener triggers. */
export type SdkListenerEffect = SdkListenerOptions extends { effect: infer E }
  ? E & ((...args: any[]) => void)
  : never;

/** Predicate callback: `(action, currentState, previousState) => boolean`, gates the effect. */
export type SdkListenerPredicate = NonNullable<
  SdkListenerOptions extends { predicate?: infer P } ? P : never
>;

/**
 * Used by parameter-change emit pipelines to fire `source: 'initial-state'`
 * exactly once per `fetchDashboard.fulfilled`
 */
export const sdkListenerMiddleware = createListenerMiddleware();

export const startSdkListening =
  sdkListenerMiddleware.startListening as SdkStartListening;
