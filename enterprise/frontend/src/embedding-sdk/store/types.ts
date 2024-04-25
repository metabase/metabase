import type {
  SerializedError,
  AnyAction,
  ThunkDispatch,
} from "@reduxjs/toolkit";
import type { JSX } from "react";

import type { SdkPluginsConfig } from "embedding-sdk/lib/plugins";
import type { State } from "metabase-types/store";

export type EmbeddingSessionTokenState = {
  token: {
    id: string;
    exp: number;
  } | null;
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

export type SdkDispatch = ThunkDispatch<SdkStoreState, void, AnyAction>;

export type SdkState = {
  token: EmbeddingSessionTokenState;
  loginStatus: LoginStatus;
  plugins: null | SdkPluginsConfig;
  loaderComponent: null | (() => JSX.Element);
  errorComponent: null | (({ message }: { message: string }) => JSX.Element);
};

export interface SdkStoreState extends State {
  sdk: SdkState;
}
