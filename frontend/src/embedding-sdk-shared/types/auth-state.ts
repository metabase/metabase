import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";
import type { User } from "metabase-types/api";

export const SDK_AUTH_STATE_KEY = "METABASE_EMBEDDING_SDK_AUTH_STATE";

/**
 * Status of the SDK authentication process.
 *
 * - "idle": No auth started (initial state or old package version)
 * - "in-progress": Package is performing auth right now
 * - "completed": Package finished auth successfully, data is cached
 * - "error": Package auth failed, bundle should retry
 * - "skipped": Package explicitly skipped auth (skipPackageAuth or non-JWT auth)
 */
export type SdkAuthStatus =
  | "idle"
  | "in-progress"
  | "completed"
  | "error"
  | "skipped";

/**
 * State of the SDK authentication shared between package and bundle via window.
 *
 * This allows the package to start auth while the bundle downloads,
 * and the bundle to use the pre-fetched auth data instead of re-fetching.
 */
export interface SdkAuthState {
  status: SdkAuthStatus;
  session?: MetabaseEmbeddingSessionToken;
  user?: User;
  siteSettings?: Record<string, any>;
  error?: Error;
}
