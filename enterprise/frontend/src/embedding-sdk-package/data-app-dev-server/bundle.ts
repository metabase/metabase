/**
 * Build/runtime constants shared by the data-app dev server preset and its dev
 * plugin. They define the single contract the Near-Membrane sandbox depends on:
 * the app is built as one IIFE that assigns its factory to `__dataAppFactory__`,
 * with React + the SDK left external and mapped to the globals the sandbox
 * endows — exactly how Metabase serves the bundle in production.
 */

/** The app entry the IIFE is built from. */
export const DATA_APP_ENTRY = "src/index.tsx";

/** The IIFE assigns the app factory to this global; the sandbox captures it. */
export const DATA_APP_FACTORY_GLOBAL = "__dataAppFactory__";

/**
 * Each externalized import mapped to the global the sandbox endows it as. These
 * global names MUST match the endowments in the host's `createDataAppSandbox`
 * (`enterprise/.../metabase-enterprise/data_apps/sandbox.ts`) — that's the
 * cross-package contract that lets the bundle share the host's single React/SDK.
 * `react/jsx-dev-runtime` is only referenced by a development-mode build (jsxDEV);
 * it's harmless in production.
 */
export const DATA_APP_GLOBALS: Record<string, string> = {
  react: "React",
  "react/jsx-runtime": "__react_jsx_runtime__",
  "react/jsx-dev-runtime": "__react_jsx_dev_runtime__",
  "@metabase/embedding-sdk-react": "__metabase_sdk__",
  "@metabase/embedding-sdk-react/data-app": "__metabase_data_app__",
};

/** The imports kept external, derived from `DATA_APP_GLOBALS` so the two can't drift. */
export const DATA_APP_EXTERNALS: string[] = Object.keys(DATA_APP_GLOBALS);

/** Dev-only URL the harness fetches the freshly-built IIFE bundle from. */
export const DATA_APP_BUNDLE_URL = "/@data-app-bundle.js";

/** Custom HMR event the dev plugin emits on rebuild so the harness soft-reloads. */
export const DATA_APP_REBUILT_EVENT = "data-app:rebuilt";
