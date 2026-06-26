import * as React from "react";
import * as ReactJsxDevRuntime from "react/jsx-dev-runtime";
import * as ReactJsxRuntime from "react/jsx-runtime";
import type { MetabaseAuthConfig } from "@metabase/embedding-sdk-react";
import * as sdkExports from "@metabase/embedding-sdk-react";
import * as dataAppExports from "@metabase/embedding-sdk-react/data-app";
import {
  DevToolbar,
  createDataAppSandbox,
  installDevDiagnostics,
} from "@metabase/embedding-sdk-react/data-app-dev";
import { createRoot } from "react-dom/client";

import { sdkTheme } from "./theme";

const { MetabaseProvider } = sdkExports;

const authConfig: MetabaseAuthConfig = {
  metabaseInstanceUrl: import.meta.env.DATA_APP_MB_URL,
  apiKey: import.meta.env.DATA_APP_MB_API_KEY,
};

// Dev diagnostics: capture errors (including the sandbox's blocked-API logs,
// which arrive via `console.error`) and surface them in a corner toolbar.
// Install before the sandbox runs so nothing is missed, and mount the toolbar in
// its own root so it shows even if the app bundle fails to load.
installDevDiagnostics();

const toolbarRoot = document.createElement("div");
document.body.appendChild(toolbarRoot);
createRoot(toolbarRoot).render(<DevToolbar />);

const root = document.getElementById("root");

if (!root) {
  throw new Error("#root not found");
}

const appRoot = createRoot(root);

// One sandbox for the whole dev session. Runs the app through the exact same
// Near-Membrane sandbox + distortion rules Metabase uses in production, so
// `npm run dev` behaves identically — including for third-party libraries the
// app bundles. `__DATA_APP_BUNDLE_URL__` serves the app pre-built as the same
// IIFE Metabase serves; `__DATA_APP_ALLOWED_HOSTS__` mirrors `data_app.yml`'s
// `allowed_hosts`. Both are injected by `dataAppSandboxDevPlugin`.
const sandbox = createDataAppSandbox({
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
});

// Fetch the freshly-built bundle, evaluate it in the sandbox, and render into
// the persistent root. On rebuild we just re-run this: because `appRoot` and the
// `<MetabaseProvider>` stay mounted, React keeps the loaded SDK bundle + auth
// and only remounts the app component — a fast "soft reload". (Component state
// resets; the membrane can't support Fast Refresh.)
async function loadAndRender() {
  const code = await fetch(__DATA_APP_BUNDLE_URL__).then((res) => res.text());
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

// Soft reload on rebuild instead of a full page reload (see the dev plugin).
import.meta.hot?.on(__DATA_APP_REBUILT_EVENT__, () => {
  void loadAndRender();
});
