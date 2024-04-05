import type { SerializedError } from "@reduxjs/toolkit";

import type { State } from "metabase-types/store";

type SDKAuthType =
  | {
      authType: "apiKey";
      apiKey: string;
    }
  | {
      authType: "jwt";
      jwtProviderUri: string;
    };

export type SDKConfigType = {
  metabaseInstanceUrl: string;
  font?: string;
} & SDKAuthType;

export type EmbeddingSessionTokenState = {
  token: {
    id: string;
    exp: number;
  } | null;
  loading: boolean;
  error: SerializedError | null;
};

export interface EnterpriseState extends State {
  plugins: {
    embeddingSessionToken: EmbeddingSessionTokenState;
  };
}

export type GetEnterpriseState = () => EnterpriseState;
