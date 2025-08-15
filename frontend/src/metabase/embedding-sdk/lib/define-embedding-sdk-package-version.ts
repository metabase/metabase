// Puts Embedding SDK package version into the global object
export function defineEmbeddingSdkPackageVersion() {
  if (typeof window === "undefined") {
    return;
  }

  window.EMBEDDING_SDK_PACKAGE_VERSION =
    process.env.EMBEDDING_SDK_PACKAGE_VERSION;
}
