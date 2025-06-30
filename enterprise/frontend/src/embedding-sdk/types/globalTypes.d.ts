interface Window {
  React?: typeof React;
  ReactJSXRuntime?: unknown;
  ReactDOM?: typeof ReactDOM;
  ReactDOMClient?: unknown;

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  MetabaseEmbeddingSDK?: typeof import("embedding-sdk/bundle");

  EMBEDDING_SDK_VERSION?: string;
}
