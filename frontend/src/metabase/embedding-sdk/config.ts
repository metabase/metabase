import type { SettingKey, TokenFeature } from "metabase-types/api";

export const EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID = "metabase-sdk-portal-root";

type InternalSdkConfig = {
  isEmbeddingSdk: boolean;
  metabaseClientRequestHeader: "embedding-sdk-react" | "embedding-simple";
  enableEmbeddingSettingKey: "enable-embedding-sdk" | "enable-embedding-simple";
  tokenFeatureKey: "embedding_sdk" | "embedding_simple";
};

export const EMBEDDING_SDK_CONFIG: InternalSdkConfig = {
  /**
   * Whether we are in the Embedding SDK or its derivatives
   * such as sdk-based iframe embedding.
   **/
  isEmbeddingSdk: false,

  /**
   * Which X-Metabase-Client header to use for requests to the Metabase instance?
   */
  metabaseClientRequestHeader: "embedding-sdk-react",

  /**
   * Which setting indicates whether the embedding is enabled?
   */
  enableEmbeddingSettingKey: "enable-embedding-sdk" satisfies SettingKey,

  /**
   * Which token feature indicates whether the embedding is available?
   */
  tokenFeatureKey: "embedding_sdk" satisfies TokenFeature,
};

export const EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG = {
  /** Whether we are in the simple embedding environment. */
  isSimpleEmbedding: false,

  /** Whether we should use the existing user session (i.e. admin user's cookie) */
  useExistingUserSession: false,
};

/**
 * Whether we are in the Embedding SDK or its derivatives
 * such as sdk-based iframe embedding.
 **/
export const isEmbeddingSdk = () => EMBEDDING_SDK_CONFIG.isEmbeddingSdk;

/**
 * Whether we are in the Embedded Analytics JS
 */
export const isEmbeddingEajs = () =>
  EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG.isSimpleEmbedding;
