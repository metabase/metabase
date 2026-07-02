/**
 * Build/runtime constants shared by the data-app dev server preset and its dev
 * plugin. They define the single contract the Near-Membrane sandbox depends on:
 * the app is built as one IIFE that assigns its factory to `__dataAppFactory__`,
 * with React + the SDK left external and mapped to the globals the sandbox
 * endows — exactly how Metabase serves the bundle in production.
 */

/** The app entry the IIFE is built from. */
export const DATA_APP_ENTRY = "src/index.tsx";

/**
 * The single source of truth for the globals the data-app bundle is built
 * against. The SDK build externalizes its imports to these names, and the host's
 * `createDataAppSandbox` (`metabase-enterprise/data_apps/sandbox.ts`) endows
 * exactly these names — both sides import this map so the build-time and runtime
 * contracts can't drift.
 */
export const DATA_APP_GLOBAL_NAMES = {
  react: "React",
  reactJsxRuntime: "__react_jsx_runtime__",
  reactJsxDevRuntime: "__react_jsx_dev_runtime__",
  sdk: "__metabase_sdk__",
  dataApp: "__metabase_data_app__",
  factory: "__dataAppFactory__",
} as const;

export const DATA_APP_FACTORY_GLOBAL = DATA_APP_GLOBAL_NAMES.factory;

/** Each externalized import mapped to the global the sandbox endows it as. */
export const DATA_APP_GLOBALS: Record<string, string> = {
  react: DATA_APP_GLOBAL_NAMES.react,
  "react/jsx-runtime": DATA_APP_GLOBAL_NAMES.reactJsxRuntime,
  "react/jsx-dev-runtime": DATA_APP_GLOBAL_NAMES.reactJsxDevRuntime,
  "@metabase/embedding-sdk-react": DATA_APP_GLOBAL_NAMES.sdk,
  "@metabase/embedding-sdk-react/data-app": DATA_APP_GLOBAL_NAMES.dataApp,
};

/** The imports kept external, derived from `DATA_APP_GLOBALS` so the two can't drift. */
export const DATA_APP_EXTERNALS: string[] = Object.keys(DATA_APP_GLOBALS);

/** Dev-only URL the dev entry fetches the freshly-built IIFE bundle from. */
export const DATA_APP_BUNDLE_URL = "/@data-app-bundle.js";

/** Custom HMR event the dev plugin emits on rebuild so the dev entry soft-reloads. */
export const DATA_APP_REBUILT_EVENT = "data-app:rebuilt";
