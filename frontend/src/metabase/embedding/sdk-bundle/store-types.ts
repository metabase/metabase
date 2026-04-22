import type {
  Action,
  AnyAction,
  SerializedError,
  Store,
  ThunkDispatch,
} from "@reduxjs/toolkit";

import type { MetabaseAuthConfig } from "metabase/embedding/sdk-bundle/types/auth-config";
import type { SdkEventHandlersConfig } from "metabase/embedding/sdk-bundle/types/events";
import type { MetabasePluginsConfig } from "metabase/embedding/sdk-bundle/types/plugins";
import type {
  InitializationStatus,
  SdkErrorComponent,
  SdkLoadingError,
} from "metabase/embedding/sdk-bundle/types/ui";
import type { SdkUsageProblem } from "metabase/embedding/sdk-bundle/types/usage-problem";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import type { State } from "metabase/redux/store";

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
};

export interface SdkStoreState extends State {
  sdk: SdkState;
}
