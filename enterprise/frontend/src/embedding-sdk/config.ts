export const DEFAULT_FONT = "Lato";
export const EMBEDDING_SDK_ROOT_ELEMENT_ID = "metabase-sdk-root";
export const EMBEDDING_SDK_PORTAL_ROOT_ELEMENT_ID = "metabase-sdk-portal-root";

export const getEmbeddingSdkVersion = () =>
  process.env.EMBEDDING_SDK_VERSION ?? "unknown";
