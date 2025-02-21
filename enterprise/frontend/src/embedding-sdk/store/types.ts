import type {
  AnyAction,
  SerializedError,
  ThunkDispatch,
} from "@reduxjs/toolkit";
import type { JSX, ReactNode } from "react";

import type {
  MetabaseAuthConfig,
  MetabaseEmbeddingSessionToken,
  MetabaseFetchRequestTokenFn,
} from "embedding-sdk";
import type { SdkEventHandlersConfig } from "embedding-sdk/lib/events";
import type { SdkUsageProblem } from "embedding-sdk/types/usage-problem";
import type { MetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import type { State } from "metabase-types/store";

export type EmbeddingSessionTokenState = {
  token: MetabaseEmbeddingSessionToken | null;
  loading: boolean;
  error: SerializedError | null;
};

type LoginStatusUninitialized = {
  status: "uninitialized";
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
  | LoginStatusSuccess
  | LoginStatusLoading
  | LoginStatusError;

export type SdkDispatch = ThunkDispatch<SdkStoreState, void, AnyAction>;

export type SdkErrorComponentProps = { message: ReactNode };
export type SdkErrorComponent = ({
  message,
}: SdkErrorComponentProps) => JSX.Element;

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
