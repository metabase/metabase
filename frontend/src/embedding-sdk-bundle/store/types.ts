import type {
  Action,
  AnyAction,
  SerializedError,
  Store,
  ThunkDispatch,
} from "@reduxjs/toolkit";

import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import type { SdkEventHandlersConfig } from "embedding-sdk-bundle/types/events";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import type {
  InitializationStatus,
  SdkErrorComponent,
  SdkLoadingError,
} from "embedding-sdk-bundle/types/ui";
import type { SdkUsageProblem } from "embedding-sdk-bundle/types/usage-problem";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import type { State } from "metabase/redux/store";
import type { DashboardTabId } from "metabase-types/api";

export type EmbeddingSessionTokenState = {
  token: MetabaseEmbeddingSessionToken | null;
  rawToken: string | null; // Raw JWT string for guest embeds token refresh
  loading: boolean;
  error: SerializedError | null;
};

export type SdkStore = Omit<Store<SdkStoreState, Action>, "dispatch"> & {
  dispatch: SdkDispatch;
};

export type SdkDispatch = ThunkDispatch<SdkStoreState, void, AnyAction>;

export type SdkState = {
  isGuestEmbed: boolean | null;
  metabaseInstanceUrl: MetabaseAuthConfig["metabaseInstanceUrl"];
  metabaseInstanceVersion: string | null;
  token: EmbeddingSessionTokenState;
  initStatus: InitializationStatus;
  error: SdkLoadingError | null;
  plugins: null | MetabasePluginsConfig;
  eventHandlers: null | SdkEventHandlersConfig;
  usageProblem: null | SdkUsageProblem;
  errorComponent: null | SdkErrorComponent;
  fetchRefreshTokenFn: null | MetabaseAuthConfig["fetchRequestToken"];
  pluginsReady: boolean;
  /**
   * Tab to apply when the next dashboard mounts via a cross-dashboard
   * click behavior. Not cleared after use: tab IDs are globally unique
   * PKs, so stale values can't match another dashboard's tabs, and the
   * selector falls back to the first tab via a `hasTab` guard. Every
   * cross-dashboard push overwrites this slot anyway.
   */
  initialDashboardTabId: DashboardTabId | null;
  /**
   * True once initSdkTracker has been called and the Snowplow SDK tracker
   * is ready to accept events. Per-mount hooks depend on this flag so they
   * never fire before the provider has wired up the tracker and authMethod.
   */
  sdkTrackerReady: boolean;
};

export interface SdkStoreState extends State {
  sdk: SdkState;
}
