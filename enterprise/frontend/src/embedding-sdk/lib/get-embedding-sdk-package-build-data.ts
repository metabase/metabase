export const EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION = "unknown";

export const getEmbeddingSdkPackageBuildData = () => {
  const version = window.METABASE_EMBEDDING_SDK_PACKAGE_VERSION ?? null;
  const buildInfo = window.METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO ?? null;

  return {
    version,
    buildInfo,
  };
};
