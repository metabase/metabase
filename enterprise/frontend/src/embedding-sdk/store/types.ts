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

export type SdkState = {
  token: EmbeddingSessionTokenState;
  isLoggedIn: boolean;
  isInitialized: boolean;
};

export interface SdkStoreState extends State {
  sdk: SdkState;
}
