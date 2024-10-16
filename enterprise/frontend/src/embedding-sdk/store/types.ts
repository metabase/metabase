import type {
  AnyAction,
  SerializedError,
  ThunkDispatch,
} from "@reduxjs/toolkit";
import type { JSX } from "react";

import type {
  EmbeddingSessionToken,
  FetchRequestTokenFn,
  SDKConfig,
} from "embedding-sdk";
import type { SdkEventHandlersConfig } from "embedding-sdk/lib/events";
import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import type { EmbeddingSessionTokenWithError } from "embedding-sdk/types/refresh-token";
import type { SdkUsageProblem } from "embedding-sdk/types/usage-problem";
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
  data: EmbeddingSessionTokenWithError;
};

export type LoginStatus =
  | LoginStatusUninitialized
  | LoginStatusValidated
  | LoginStatusSuccess
  | LoginStatusLoading
  | LoginStatusError;

export type SdkDispatch = ThunkDispatch<SdkStoreState, void, AnyAction>;

export type SdkErrorComponentProps = LoginStatusError["data"] & {
  title: string;
  description?: string;
  link?: string;
};
export type SdkErrorComponent = ({
  status,
  code,
}: SdkErrorComponentProps) => JSX.Element;

export type SdkState = {
  metabaseInstanceUrl: SDKConfig["metabaseInstanceUrl"];
  token: EmbeddingSessionTokenState;
  loginStatus: LoginStatus;
  plugins: Nullable<SdkPluginsConfig>;
  eventHandlers: Nullable<SdkEventHandlersConfig>;
  usageProblem: Nullable<SdkUsageProblem>;
  loaderComponent: Nullable<() => JSX.Element>;
  errorComponent: Nullable<SdkErrorComponent>;
  fetchRefreshTokenFn: Nullable<FetchRequestTokenFn>;
};

export interface SdkStoreState extends State {
  sdk: SdkState;
}
