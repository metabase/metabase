import type {
  AnyAction,
  SerializedError,
  ThunkDispatch,
} from "@reduxjs/toolkit";
import type { JSX } from "react";

import type { MetabaseAuthConfig } from "embedding-sdk/types/auth-config";
import type { SdkEventHandlersConfig } from "embedding-sdk/types/events";
import type { MetabasePluginsConfig } from "embedding-sdk/types/plugins";
import type {
  MetabaseEmbeddingSessionToken,
  MetabaseFetchRequestTokenFn,
} from "embedding-sdk/types/refresh-token";
import type { SdkErrorComponent } from "embedding-sdk/types/ui";
import type { SdkUsageProblem } from "embedding-sdk/types/usage-problem";
import type { LoginStatus } from "embedding-sdk/types/user";
import type { State } from "metabase-types/store";

export type EmbeddingSessionTokenState = {
  token: MetabaseEmbeddingSessionToken | null;
  loading: boolean;
  error: SerializedError | null;
};

export type SdkDispatch = ThunkDispatch<SdkStoreState, void, AnyAction>;

export type SdkState = {
  metabaseInstanceUrl: MetabaseAuthConfig["metabaseInstanceUrl"];
  token: EmbeddingSessionTokenState;
  loginStatus: LoginStatus;
  plugins: null | MetabasePluginsConfig;
  eventHandlers: null | SdkEventHandlersConfig;
  usageProblem: null | SdkUsageProblem;
  loaderComponent: null | (() => JSX.Element);
  errorComponent: null | SdkErrorComponent;
  fetchRefreshTokenFn: null | MetabaseFetchRequestTokenFn;
};

export interface SdkStoreState extends State {
  sdk: SdkState;
}
