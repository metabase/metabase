import type { SerializedError } from "@reduxjs/toolkit";

import type { State } from "metabase-types/store";

export type EmbeddingSessionTokenState = {
  token: {
    id: string;
    exp: number;
  } | null;
  loading: boolean;
  error: SerializedError | null;
};

type LoginStatusUninitialized = { status: "uninitialized" };
type LoginStatusSuccess = { status: "success" };
type LoginStatusLoading = { status: "loading" };
export type LoginStatusError = { status: "error"; error: Error };

export type LoginStatus =
  | LoginStatusUninitialized
  | LoginStatusSuccess
  | LoginStatusLoading
  | LoginStatusError;

export type SdkState = {
  token: EmbeddingSessionTokenState;
  loginStatus: LoginStatus;
};

export interface SdkStoreState extends State {
  sdk: SdkState;
}
