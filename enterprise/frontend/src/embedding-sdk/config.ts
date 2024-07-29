export const DEFAULT_FONT = "Lato";
export const EMBEDDING_SDK_ROOT_ELEMENT_ID = "metabase-sdk-root";

const injectedSdkVersion = window?.EMBEDDING_SDK_VERSION;
export const getEmbeddingSdkVersion = () => injectedSdkVersion ?? "unknown";
