/* eslint-disable @typescript-eslint/consistent-type-imports */
interface Window {
  React?: typeof React;
  ReactJSXRuntime?: unknown;
  ReactDOM?: typeof ReactDOM;
  ReactDOMClient?: unknown;
  ReactDOMServer?: unknown;

  // Metabase Embedding SDK from Hosted Bundle
  MetabaseEmbeddingSDK?: import("embedding-sdk/types/sdk-bundle").MetabaseEmbeddingSdkBundleExports;

  METABASE_PROVIDER_PROPS_STORE?: typeof import("embedding-sdk/sdk-shared/lib/ensure-metabase-provider-props-store").MetabaseProviderPropsStore;

  EMBEDDING_SDK_VERSION?: string;
}
