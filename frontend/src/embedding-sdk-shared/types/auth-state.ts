import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

/**
 * Status of the SDK authentication flow.
 * - "idle": No auth has started yet
 * - "in-progress": Auth requests are in flight
 * - "completed": Auth completed successfully
 * - "error": Auth failed with an error
 */
export type SdkAuthStatus = "idle" | "in-progress" | "completed" | "error";

/**
 * Shared state object stored in window.METABASE_EMBEDDING_SDK_AUTH_STATE
 * Used to coordinate JWT authentication between the SDK package and bundle.
 *
 * The package starts the auth flow early (before bundle loads) and stores
 * results here. The bundle then reads from this state to avoid redundant requests.
 */
export interface SdkAuthState {
  /**
   * Current status of the auth flow
   */
  status: SdkAuthStatus;

  /**
   * The JWT provider URI (either from config or discovered via /auth/sso)
   */
  jwtProviderUri?: string;

  /**
   * The JWT token fetched from the customer's backend
   */
  jwtToken?: string;

  /**
   * The final session token from Metabase (after exchanging JWT)
   */
  session?: MetabaseEmbeddingSessionToken | null;

  /**
   * Error object if auth failed
   */
  error?: Error;
}
