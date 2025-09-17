import type {
  Action,
  AnyAction,
  SerializedError,
  Store,
  ThunkDispatch,
} from "@reduxjs/toolkit";
import type { JSX } from "react";

import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import type { SdkEventHandlersConfig } from "embedding-sdk-bundle/types/events";
import type { MetabasePluginsConfig } from "embedding-sdk-bundle/types/plugins";
import type { MetabaseEmbeddingSessionToken } from "embedding-sdk-bundle/types/refresh-token";
import type { SdkErrorComponent } from "embedding-sdk-bundle/types/ui";
import type { SdkUsageProblem } from "embedding-sdk-bundle/types/usage-problem";
import type { LoginStatus } from "embedding-sdk-bundle/types/user";
import type { State } from "metabase-types/store";

export type EmbeddingSessionTokenState = {
  token: MetabaseEmbeddingSessionToken | null;
  loading: boolean;
  error: SerializedError | null;
};

export type SdkStore = Omit<Store<SdkStoreState, Action>, "dispatch"> & {
  dispatch: SdkDispatch;
};

export type SdkDispatch = ThunkDispatch<SdkStoreState, void, AnyAction>;

export type SdkState = {
  metabaseInstanceUrl: MetabaseAuthConfig["metabaseInstanceUrl"];
  metabaseInstanceVersion: string | null;
  token: EmbeddingSessionTokenState;
  loginStatus: LoginStatus;
  plugins: null | MetabasePluginsConfig;
  eventHandlers: null | SdkEventHandlersConfig;
  usageProblem: null | SdkUsageProblem;
  loaderComponent: null | (() => JSX.Element);
  errorComponent: null | SdkErrorComponent;
  fetchRefreshTokenFn: null | MetabaseAuthConfig["fetchRequestToken"];
};

export interface SdkStoreState extends State {
  sdk: SdkState;
}
