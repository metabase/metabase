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

export interface SdkState extends State {
  embeddingSessionToken: EmbeddingSessionTokenState;
}
