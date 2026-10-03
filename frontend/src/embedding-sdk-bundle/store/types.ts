import type {
  Action,
  AnyAction,
  SerializedError,
  Store,
  ThunkDispatch,
} from "@reduxjs/toolkit";

import type { SdkEventHandlersConfig } from "embedding-sdk-bundle/types/events";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import type {
  InitializationStatus,
  SdkErrorComponent,
  SdkLoadingError,
} from "embedding-sdk-bundle/types/ui";
import type { SdkUsageProblem } from "embedding-sdk-bundle/types/usage-problem";
import type { MetabaseAuthConfig } from "embedding-sdk-shared/types/auth-config";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import type { SdkSharedState } from "metabase/embedding-sdk/types/store";
import type { State } from "metabase/redux/store";

export type EmbeddingSessionTokenState = {
  token: MetabaseEmbeddingSessionToken | null;
  // Raw guest embed JWTs kept so the refresh handler can check expiry and write
  // the refreshed JWT back (see store/guest-embed/auth.ts). Keyed by a stable
  // per-mount id so concurrent guest embeds under one MetabaseProvider don't
  // overwrite each other's token.
  guestTokensByMount: Record<string, string>;
  loading: boolean;
  error: SerializedError | null;
};

export type SdkStore = Omit<Store<SdkStoreState, Action>, "dispatch"> & {
  dispatch: SdkDispatch;
};

export type SdkDispatch = ThunkDispatch<SdkStoreState, void, AnyAction>;

export type SdkState = SdkSharedState & {
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
   * True once initSdkTracker has been called and the Snowplow SDK tracker
   * is ready to accept events. Per-mount hooks depend on this flag so they
   * never fire before the provider has wired up the tracker and authMethod.
   */
  sdkTrackerReady: boolean;
};

export interface SdkStoreState extends State {
  sdk: SdkState;
}
