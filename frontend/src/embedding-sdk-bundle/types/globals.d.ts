interface Window {
  // The bundle writes this global (see embedding-sdk-bundle/index.ts) and the
  // npm package reads it. The declaration lives here, next to the exports
  // type, so that embedding-sdk-shared does not depend on bundle types.
  METABASE_EMBEDDING_SDK_BUNDLE?: import("embedding-sdk-bundle/types/sdk-bundle").MetabaseEmbeddingSdkBundleExports;
}
