/**
 * Build options shared by the production bundle (`vite build`) and the dev
 * sandbox harness (`npm run dev`), so the code the Near-Membrane sandbox runs in
 * dev is built exactly the way Metabase serves it in production: a single IIFE
 * that assigns the app's factory to `__dataAppFactory__`, with React and the SDK
 * left external and mapped to the globals the sandbox endows.
 */

export const DATA_APP_ENTRY = "src/index.tsx";

/** The IIFE assigns the factory to this global; the sandbox captures it. */
export const DATA_APP_FACTORY_GLOBAL = "__dataAppFactory__";

export const DATA_APP_EXTERNALS: string[] = [
  "react",
  "react-dom",
  "react-dom/client",
  "react-dom/server",
  "react/jsx-runtime",
  // Only referenced by a development-mode build (jsxDEV); harmless in production.
  "react/jsx-dev-runtime",
  "@metabase/embedding-sdk-react",
  "@metabase/embedding-sdk-react/data-app",
];

export const DATA_APP_GLOBALS: Record<string, string> = {
  react: "React",
  "react-dom": "__react_dom__",
  "react-dom/client": "__react_dom_client__",
  "react-dom/server": "__react_dom_server__",
  "react/jsx-runtime": "__react_jsx_runtime__",
  "react/jsx-dev-runtime": "__react_jsx_dev_runtime__",
  "@metabase/embedding-sdk-react": "__metabase_sdk__",
  "@metabase/embedding-sdk-react/data-app": "__metabase_data_app__",
};

// Libraries such as react-datepicker require a process.NODE_ENV define.
export function getDataAppDefine(mode: string): Record<string, string> {
  return {
    "process.env.NODE_ENV": JSON.stringify(
      mode === "production" ? "production" : "development",
    ),
  };
}
