import * as React from "react";
import * as ReactJsxDevRuntime from "react/jsx-dev-runtime";
import * as ReactJsxRuntime from "react/jsx-runtime";
import type { MetabaseAuthConfig } from "@metabase/embedding-sdk-react";
import * as sdkExports from "@metabase/embedding-sdk-react";
import * as dataAppExports from "@metabase/embedding-sdk-react/data-app";
import { createDataAppSandbox } from "@metabase/embedding-sdk-react/data-app-sandbox";
import { createRoot } from "react-dom/client";

import { sdkTheme } from "./theme";

const { MetabaseProvider } = sdkExports;

const authConfig: MetabaseAuthConfig = {
  metabaseInstanceUrl: import.meta.env.DATA_APP_MB_URL,
  apiKey: import.meta.env.DATA_APP_MB_API_KEY,
};

// Run the app through the exact same Near-Membrane sandbox + distortion rules
// Metabase uses in production, so `npm run dev` behaves identically — including
// for third-party libraries the app bundles. `__DATA_APP_BUNDLE_URL__` serves
// the app pre-built as the same IIFE Metabase serves; `__DATA_APP_ALLOWED_HOSTS__`
// mirrors the app's `data_app.yml` `allowed_hosts`. Both are injected by
// `dataAppSandboxDevPlugin`.
async function renderSandboxedApp() {
  const root = document.getElementById("root");

  if (!root) {
    throw new Error("#root not found");
  }

  const code = await fetch(__DATA_APP_BUNDLE_URL__).then((res) => res.text());

  const factory = createDataAppSandbox({
    label: "dev",
    targetWindow: window,
    allowedHosts: __DATA_APP_ALLOWED_HOSTS__,
    endowments: {
      React,
      reactJsxRuntime: ReactJsxRuntime,
      reactJsxDevRuntime: ReactJsxDevRuntime,
      sdkExports,
      dataAppExports,
    },
  }).evaluate(code);

  const { component: Component, providerProps } = factory();

  createRoot(root).render(
    <MetabaseProvider
      authConfig={authConfig}
      theme={sdkTheme}
      {...(providerProps ?? {})}
    >
      <Component />
    </MetabaseProvider>,
  );
}

renderSandboxedApp();
