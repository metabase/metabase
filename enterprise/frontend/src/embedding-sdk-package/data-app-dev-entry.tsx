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
  instanceConnectionCheck,
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

import { DATA_APP_PROVIDER_PROP_KEYS } from "metabase-enterprise/data_apps/sandbox/types";

// The same baseline reset the production iframe loads (`iframe-vendors.ts`), so the
// dev preview matches production. style-loader injects it at runtime.
import "metabase-enterprise/data_apps/sandbox/iframe-baseline.css";

const authConfig = {
  metabaseInstanceUrl: import.meta.env.DATA_APP_MB_URL ?? "",
  apiKey: import.meta.env.DATA_APP_MB_API_KEY ?? "",
};

devDiagnostics.install();

instanceConnectionCheck.install({
  metabaseUrl: authConfig.metabaseInstanceUrl,
  sdkVersion,
});

sdkCallCapture.install(authConfig.metabaseInstanceUrl);

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

const sandboxPromise = createDataAppSandbox({
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
  const sandbox = await sandboxPromise;
  const res = await fetch(bundleUrl, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(
      `Failed to load the data-app bundle: ${res.status} ${res.statusText}.`,
    );
  }

  const code = await res.text();
  const { component: Component, providerProps } = sandbox.evaluate(code)();

  const rawProviderProps = providerProps ?? {};
  const safeProviderProps = Object.fromEntries(
    DATA_APP_PROVIDER_PROP_KEYS.filter((key) => key in rawProviderProps).map(
      (key) => [key, rawProviderProps[key]],
    ),
  );

  appRoot.render(
    <DataAppDevProvider
      appSlug={appSlug}
      authConfig={authConfig}
      {...safeProviderProps}
    >
      <Component />
    </DataAppDevProvider>,
  );
}

loadAndRender().catch((error) => {
  console.error(error);
});

installDiagnosticsReporter();

if (hot) {
  hot.on(rebuiltEvent, () => {
    loadAndRender().catch((error) => {
      console.error(error);
    });
  });
}
