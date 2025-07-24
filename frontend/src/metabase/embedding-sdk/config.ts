export const EMBEDDING_SDK_ROOT_ELEMENT_ID = "metabase-sdk-root";
export const EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID = "metabase-sdk-portal-root";

export const EMBEDDING_SDK_CONFIG = {
  /**
   * Whether we are in the Embedding SDK or its derivatives
   * such as sdk-based iframe embedding.
   **/
  isEmbeddingSdk: false,

  /**
   * Which X-Metabase-Client header to use for requests to the Metabase instance?
   */
  metabaseClientRequestHeader: "embedding-sdk-react",
};

export const EMBEDDING_SDK_IFRAME_EMBEDDING_CONFIG = {
  /** Whether the iframe embedding auth flow should be used. */
  isSdkIframeEmbedAuth: false,

  /** Whether we should use the existing user session (i.e. admin user's cookie) */
  useExistingUserSession: false,
};

/**
 * Whether we are in the Embedding SDK or its derivatives
 * such as sdk-based iframe embedding.
 **/
export const isEmbeddingSdk = () => EMBEDDING_SDK_CONFIG.isEmbeddingSdk;
