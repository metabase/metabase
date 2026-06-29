import * as React from "react";
import * as ReactJsxDevRuntime from "react/jsx-dev-runtime";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as sdkExports from "@metabase/embedding-sdk-react";
import * as dataAppExports from "@metabase/embedding-sdk-react/data-app";
import {
  DevToolbar,
  createDataAppSandbox,
  installDevDiagnostics,
} from "@metabase/embedding-sdk-react/data-app-dev";
import {
  allowedHosts,
  bundleUrl,
  rebuiltEvent,
} from "virtual:metabase-data-app-dev-config";
import { createRoot } from "react-dom/client";

// The data-app dev entry. This file is NOT compiled by this repo — it's copied
// verbatim into the SDK dist as `data-app-dev-entry.ts` by
// `enterprise/frontend/src/embedding-sdk-package/bin/generate-package-support-files.ts`,
// and the dev server plugin reads that copy and serves it as a Vite virtual
// module, so it runs in the consumer's app where `react`, `react-dom`, and
// `@metabase/embedding-sdk-react/*` resolve. `virtual:metabase-data-app-dev-config`
// is provided by the plugin (the app's `allowed_hosts` + the bundle URL/event).
//
// It mounts the diagnostics toolbar, builds the Near-Membrane sandbox, then
// fetches + evaluates the app's IIFE bundle and renders it under
// `MetabaseProvider`. Kept JSX-free (React.createElement) so it needs no JSX
// transform as a virtual module. Load failures go through `console.error`, so
// the toolbar surfaces them.

const { createElement } = React;
const { MetabaseProvider } = sdkExports;

const authConfig = {
  metabaseInstanceUrl: import.meta.env.VITE_MB_URL,
  apiKey: import.meta.env.VITE_MB_API_KEY,
};

installDevDiagnostics();

const toolbarRoot = document.createElement("div");
document.body.appendChild(toolbarRoot);
createRoot(toolbarRoot).render(createElement(DevToolbar));

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
    createElement(MetabaseProvider, {
      authConfig,
      ...providerProps,
      children: createElement(Component),
    }),
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
