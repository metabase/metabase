import type { MetabaseAuthConfig } from "@metabase/embedding-sdk-react";
import * as sdkExports from "@metabase/embedding-sdk-react";
import * as dataAppExports from "@metabase/embedding-sdk-react/data-app";
import {
  DevToolbar,
  createDataAppSandbox,
  installDevDiagnostics,
} from "@metabase/embedding-sdk-react/data-app-dev";
import * as React from "react";
import * as ReactJsxDevRuntime from "react/jsx-dev-runtime";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as ReactDOMServer from "react-dom/server";

import { sdkTheme } from "./theme";

const { MetabaseProvider } = sdkExports;

const authConfig: MetabaseAuthConfig = {
  metabaseInstanceUrl: import.meta.env.DATA_APP_MB_URL,
  apiKey: import.meta.env.DATA_APP_MB_API_KEY,
};

installDevDiagnostics();

const toolbarRoot = document.createElement("div");
document.body.appendChild(toolbarRoot);
ReactDOMClient.createRoot(toolbarRoot).render(<DevToolbar />);

const root = document.getElementById("root");

if (!root) {
  throw new Error("#root not found");
}

const appRoot = ReactDOMClient.createRoot(root);

const sandbox = createDataAppSandbox({
  label: "dev",
  targetWindow: window,
  allowedHosts: __DATA_APP_ALLOWED_HOSTS__,
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
  const res = await fetch(__DATA_APP_BUNDLE_URL__, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(
      `Failed to load the data-app bundle: ${res.status} ${res.statusText}.`,
    );
  }

  const code = await res.text();
  const { component: Component, providerProps } = sandbox.evaluate(code)();

  appRoot.render(
    <MetabaseProvider
      authConfig={authConfig}
      theme={sdkTheme}
      {...(providerProps ?? {})}
    >
      <Component />
    </MetabaseProvider>,
  );
}

void loadAndRender();

import.meta.hot?.on(__DATA_APP_REBUILT_EVENT__, () => {
  void loadAndRender();
});
