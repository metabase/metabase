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
  installDiagnosticsReporter,
  sdkCallCapture,
  devDiagnostics,
  runInstanceConnectionCheck,
} from "@metabase/embedding-sdk-react/data-app-dev";
import {
  allowedHosts,
  appSlug,
  bundleUrl,
  rebuiltEvent,
  sdkVersion,
} from "virtual:metabase-data-app-dev-config";
import { createRoot } from "react-dom/client";

// The same baseline reset the production iframe loads (`iframe-vendors.ts`), so the
// dev preview matches production. style-loader injects it at runtime.
import "metabase-enterprise/data_apps/sandbox/iframe-baseline.css";

// Built by rspack into the SDK dist (`rspack.embedding-sdk-package.config.js`).
// React, the SDK subpaths and the virtual config stay EXTERNAL so the consumer's
// Vite resolves them: the preview has to run against the same React and SDK
// instances the app bundle is endowed with, not copies of them.

// Either may be missing from `.env.local`. Rendering anyway is deliberate: the
// requests then fail, and the diagnostics feed names the env var to fill — which
// beats a blank page with the reason only in the terminal.
const authConfig = {
  metabaseInstanceUrl: import.meta.env.DATA_APP_MB_URL ?? "",
  apiKey: import.meta.env.DATA_APP_MB_API_KEY ?? "",
};

devDiagnostics.install();

runInstanceConnectionCheck({
  metabaseUrl: authConfig.metabaseInstanceUrl,
  sdkVersion,
});

sdkCallCapture.install(authConfig.metabaseInstanceUrl);

const hot = import.meta.hot;

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
  onBlocked: devDiagnostics.recordSandboxBlocked,
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

if (hot) {
  // Mirror the toolbar's data to the dev server, which re-serves it as JSON for
  // tools that have a shell but no browser (see `diagnostics-channel.ts`).
  installDiagnosticsReporter(hot);

  hot.on(rebuiltEvent, () => {
    loadAndRender().catch((error) => {
      console.error(error);
    });
  });
}
