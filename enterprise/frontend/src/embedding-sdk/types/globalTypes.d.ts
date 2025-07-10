interface Window {
  React?: typeof React;
  ReactJSXRuntime?: unknown;
  ReactDOM?: typeof ReactDOM;
  ReactDOMClient?: unknown;

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  MetabaseEmbeddingSDK?: typeof import("embedding-sdk/bundle");

  EMBEDDING_SDK_BUNDLE_LOADING?: boolean;
  EMBEDDING_SDK_VERSION?: string;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  METABASE_PROVIDER_STORE?: typeof import("embedding-sdk/sdk-loader/lib/private/lazy-sdk-store").MetabaseProviderStore;
}
