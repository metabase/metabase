export const EMBEDDING_SDK_PACKAGE_UNKNOWN_VERSION = "unknown";

export const getEmbeddingSdkPackageVersion = (): string | null =>
  window.EMBEDDING_SDK_PACKAGE_VERSION ?? null;
