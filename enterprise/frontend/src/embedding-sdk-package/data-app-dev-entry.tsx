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
  installDiagnosticsReporter,
  installSdkCallCapture,
  recordSandboxBlockedEvent,
  runDevConnectionCheck,
} from "@metabase/embedding-sdk-react/data-app-dev";
import {
  allowedHosts,
  appSlug,
  bundleUrl,
  diagnosticsChangedEvent,
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
// requests then fail, and the toolbar's Connection tab names the env var to fill
// — which beats a blank page with the reason only in the terminal.
const authConfig = {
  metabaseInstanceUrl: import.meta.env.DATA_APP_MB_URL ?? "",
  apiKey: import.meta.env.DATA_APP_MB_API_KEY ?? "",
};

installDevDiagnostics();

// The page's fetch, captured before `installSdkCallCapture` patches it, so the
// connection check's own probes don't show up in the Queries tab.
const uncapturedFetch = window.fetch.bind(window);
installSdkCallCapture(authConfig.metabaseInstanceUrl);
runDevConnectionCheck({
  metabaseUrl: authConfig.metabaseInstanceUrl,
  sdkVersion,
  fetchFn: uncapturedFetch,
});

const hot = import.meta.hot;

const subscribeToDiagnostics = hot
  ? (onChange: () => void) => {
      hot.on(diagnosticsChangedEvent, onChange);

      return () => hot.off(diagnosticsChangedEvent, onChange);
    }
  : undefined;

const toolbarRoot = document.createElement("div");

document.body.appendChild(toolbarRoot);
createRoot(toolbarRoot).render(
  <DevToolbar subscribe={subscribeToDiagnostics} />,
);

const root = document.getElementById("root");

if (!root) {
  throw new Error("#root not found");
}

const appRoot = createRoot(root);

const sandbox = createDataAppSandbox({
  label: "dev",
  targetWindow: window,
  allowedHosts,
  onBlocked: recordSandboxBlockedEvent,
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
