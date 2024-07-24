import type {
  SerializedError,
  AnyAction,
  ThunkDispatch,
} from "@reduxjs/toolkit";
import type { JSX, ReactNode } from "react";

import type {
  SDKConfig,
  FetchRequestTokenFn,
  EmbeddingSessionToken,
} from "embedding-sdk";
import type { SdkEventHandlersConfig } from "embedding-sdk/lib/events";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import type { State } from "metabase-types/store";

export type EmbeddingSessionTokenState = {
  token: EmbeddingSessionToken | null;
  loading: boolean;
  error: SerializedError | null;
};

type LoginStatusUninitialized = {
  status: "uninitialized";
};
type LoginStatusValidated = {
  status: "validated";
};
type LoginStatusSuccess = {
  status: "success";
};
type LoginStatusLoading = {
  status: "loading";
};
export type LoginStatusError = {
  status: "error";
  error: Error;
};

export type LoginStatus =
  | LoginStatusUninitialized
  | LoginStatusValidated
  | LoginStatusSuccess
  | LoginStatusLoading
  | LoginStatusError;

export type SdkEnvMode = "dev" | "prod";

export type SdkDispatch = ThunkDispatch<SdkStoreState, void, AnyAction>;

export type SdkErrorComponentProps = { message: string | ReactNode };
export type SdkErrorComponent = ({
  message,
}: SdkErrorComponentProps) => JSX.Element;

export type SdkState = {
  envMode: SdkEnvMode;
  metabaseInstanceUrl: SDKConfig["metabaseInstanceUrl"];
  token: EmbeddingSessionTokenState;
  loginStatus: LoginStatus;
  plugins: null | SdkPluginsConfig;
  eventHandlers: null | SdkEventHandlersConfig;
  loaderComponent: null | (() => JSX.Element);
  errorComponent: null | SdkErrorComponent;
  fetchRefreshTokenFn: null | FetchRequestTokenFn;
};

export interface SdkStoreState extends State {
  sdk: SdkState;
}
