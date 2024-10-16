import { SdkErrorStatus } from "embedding-sdk/components/private/SdkError/types/status";

export type EmbeddingSessionTokenWithError = {
  status: SdkErrorStatus;
  code?: Response["status"];
};

export type EmbeddingSessionTokenSuccess = {
  id: string;
  exp: number;
  status: "ok";
  iat: number;
};

export type EmbeddingSessionToken =
  | EmbeddingSessionTokenSuccess
  | EmbeddingSessionTokenWithError;

export type FetchRequestTokenFn = (
  url: string,
) => Promise<EmbeddingSessionToken | null>;