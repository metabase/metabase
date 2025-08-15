export const EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION = "unknown";

export const getEmbeddingSdkPackageBuildData = () =>
  window.METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO ?? null;
