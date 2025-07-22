/* eslint-disable @typescript-eslint/consistent-type-imports */
interface Window {
  React?: typeof React;
  ReactJSXRuntime?: unknown;
  ReactDOM?: typeof ReactDOM;
  ReactDOMClient?: unknown;
  ReactDOMServer?: unknown;

  MetabaseEmbeddingSDK?: typeof import("embedding-sdk/bundle");

  EMBEDDING_SDK_BUNDLE_LOADING_STATE?: import("embedding-sdk/sdk-wrapper/types/sdk-bundle-script").SdkBundleScriptLoadingState;
  EMBEDDING_SDK_VERSION?: string;
  METABASE_PROVIDERS_COUNT?: number;
  METABASE_PROVIDER_STORE?: typeof import("embedding-sdk/sdk-shared/lib/metabase-provider-store").MetabaseProviderStore;
}
