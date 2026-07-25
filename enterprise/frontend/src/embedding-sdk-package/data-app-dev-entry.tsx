import {
  DataAppDevProvider,
  DevToolbar,
  createDataAppSandbox,
  devDiagnostics,
  ensureMetabaseProviderPropsStore,
  installDiagnosticsReporter,
  instanceConnectionCheck,
  mountDataAppSdkComponent,
  sdkCallCapture,
} from "@metabase/embedding-sdk-react/data-app-dev";
import {
  allowedHosts,
  appSlug,
  bundleUrl,
  rebuiltEvent,
  sdkVersion,
} from "virtual:metabase-data-app-dev-config";
import { createRoot } from "react-dom/client";

// Imported purely for its side effects
import "@metabase/embedding-sdk-react/data-app";

// The same baseline reset the production iframe loads (`iframe-vendors.ts`), so the
// dev preview matches production. style-loader injects it at runtime.
import "metabase-enterprise/data_apps/sandbox/iframe-baseline.css";

// Either may be missing from `.env.local`. Rendering anyway is deliberate: the
// requests then fail, and the diagnostics feed names the env var to fill — which
// beats a blank page with the reason only in the terminal.
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
    providerPropsStore: ensureMetabaseProviderPropsStore(),
    sdkMount: mountDataAppSdkComponent,
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
