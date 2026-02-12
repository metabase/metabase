/* eslint-disable @typescript-eslint/consistent-type-imports */
interface Window {
  React?: typeof React;
  ReactJSXRuntime?: unknown;
  ReactDOM?: typeof ReactDOM;
  ReactDOMClient?: unknown;
  ReactDOMServer?: unknown;

  METABASE_EMBEDDING_SDK_BUNDLE?: import("embedding-sdk-bundle/types/sdk-bundle").MetabaseEmbeddingSdkBundleExports;
  METABASE_PROVIDER_PROPS_STORE?: import("embedding-sdk-shared/lib/ensure-metabase-provider-props-store").MetabaseProviderPropsStore;
  METABASE_EMBEDDING_SDK_PACKAGE_BUILD_INFO?: import("metabase/embedding-sdk/types/build-info").BuildInfo;
  METABASE_EMBEDDING_SDK_BUNDLE_BUILD_INFO?: import("metabase/embedding-sdk/types/build-info").BuildInfo;
  METABASE_EMBEDDING_SDK_IS_HOST_APP_IN_DEV_MODE?: boolean; // Added in v59
}
