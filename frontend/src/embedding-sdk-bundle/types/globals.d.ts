interface Window {
  // The bundle writes this global (see embedding-sdk-bundle/index.ts) and the
  // npm package reads it. The declaration lives here, next to the exports
  // type, so that embedding-sdk-shared does not depend on bundle types.
  //
  // A top-level import would turn this file into a module, and `interface
  // Window` would stop augmenting the global one, so the type is inlined.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  METABASE_EMBEDDING_SDK_BUNDLE?: import("embedding-sdk-bundle/types/sdk-bundle").MetabaseEmbeddingSdkBundleExports;
}
