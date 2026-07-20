import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as ReactDOMServer from "react-dom/server";
import * as ReactJsxDevRuntime from "react/jsx-dev-runtime";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as sdkExports from "@metabase/embedding-sdk-react";
import * as dataAppExports from "@metabase/embedding-sdk-react/data-app";
import {
  DataAppDevProvider,
  DevToolbar,
  createDataAppSandbox,
  installDevDiagnostics,
} from "@metabase/embedding-sdk-react/data-app-dev";
import {
  allowedHosts,
  appSlug,
  bundleUrl,
  rebuiltEvent,
} from "virtual:metabase-data-app-dev-config";
import { createRoot } from "react-dom/client";

// The same baseline reset the production iframe loads (`iframe-vendors.ts`), so the
// dev preview matches production. style-loader injects it at runtime.
import "metabase-enterprise/data_apps/sandbox/iframe-baseline.css";

// The data-app dev entry. rspack bundles this file into the SDK dist as
// `data-app-dev-entry.js` (see `rspack.embedding-sdk-package.config.js`),
// inlining the sandbox + dev toolbar so they aren't part of the package's public
// API. `react`, `react-dom`, `@metabase/embedding-sdk-react/*`, and the dev
// plugin's `virtual:metabase-data-app-dev-config` are left EXTERNAL, so the
// consumer's Vite resolves them — the bundle runs against the consumer's single
// React/SDK instance (the same ones the app bundle is endowed with), and the dev
// plugin provides the config (the app's `allowed_hosts` + the bundle URL/event).
//
// It mounts the diagnostics toolbar, builds the Near-Membrane sandbox, then
// fetches + evaluates the app's IIFE bundle and renders it under
// `DataAppDevProvider`. Load failures go through `console.error`, so the toolbar
// surfaces them.

const authConfig = {
  metabaseInstanceUrl: import.meta.env.DATA_APP_MB_URL,
  apiKey: import.meta.env.DATA_APP_MB_API_KEY,
};

installDevDiagnostics();

const toolbarRoot = document.createElement("div");
document.body.appendChild(toolbarRoot);
createRoot(toolbarRoot).render(<DevToolbar />);

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root not found");
}
const appRoot = createRoot(root);

const sandbox = createDataAppSandbox({
  label: "dev",
  targetWindow: window,
  allowedHosts,
  endowments: {
    React,
    reactDom: ReactDOM,
    reactDomClient: ReactDOMClient,
    reactDomServer: ReactDOMServer,
    reactJsxRuntime: ReactJsxRuntime,
    reactJsxDevRuntime: ReactJsxDevRuntime,
    sdkExports,
    dataAppExports,
  },
});

async function loadAndRender() {
  const res = await fetch(bundleUrl, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(
      `Failed to load the data-app bundle: ${res.status} ${res.statusText}.`,
    );
  }

  const code = await res.text();
  const { component: Component, providerProps } = sandbox.evaluate(code)();

  appRoot.render(
    <DataAppDevProvider
      appSlug={appSlug}
      authConfig={authConfig}
      {...providerProps}
    >
      <Component />
    </DataAppDevProvider>,
  );
}

loadAndRender().catch((error) => {
  console.error(error);
});

if (import.meta.hot) {
  import.meta.hot.on(rebuiltEvent, () => {
    loadAndRender().catch((error) => {
      console.error(error);
    });
  });
}
