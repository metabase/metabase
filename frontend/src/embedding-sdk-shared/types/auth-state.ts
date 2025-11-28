import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import type { User } from "metabase-types/api";

export type SdkAuthStatus =
  | "idle"
  | "in-progress"
  | "completed"
  | "error"
  | "skipped";

export interface SdkAuthState {
  status: SdkAuthStatus;
  session?: MetabaseEmbeddingSessionToken;
  user?: User;
  siteSettings?: Record<string, unknown>;
  error?: Error;
}

export const SDK_AUTH_STATE_KEY = "METABASE_EMBEDDING_SDK_AUTH_STATE";

