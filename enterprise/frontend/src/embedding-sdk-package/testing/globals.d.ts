interface Window {
  // A top-level import would turn this file into a module, and `interface
  // Window` would stop augmenting the global one, so the type is inlined.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  METABASE_EMBEDDING_SDK_MOCKS?: import("embedding-sdk-package/testing/lib/mock-sdk-registry").MockSdkRegistry;
}
