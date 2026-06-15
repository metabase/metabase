import type * as React from "react";

import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { getSubpathSafeUrl } from "metabase/urls";

import { createDataAppSandbox } from "./sandbox";

export interface LoadedDataApp {
  component: React.ComponentType<Record<string, unknown>>;
  theme?: MetabaseTheme;
}

/**
 * Fetch a data-app bundle's raw JS source. Called from the iframe-top
 * `DataAppIframeApp` after it reads the `:name` from the URL.
 */
export async function fetchDataAppBundleCode(name: string): Promise<string> {
  const url = getSubpathSafeUrl(
    `/api/data-app/${encodeURIComponent(name)}/bundle?t=${Date.now()}`,
  );

  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Failed to fetch data-app bundle: HTTP ${res.status}`);
  }

  return res.text();
}

/**
 * Build a Near Membrane sandbox bound to `targetWindow` and evaluate the
 * bundle inside it. With the iframe-top app architecture, `targetWindow` is
 * the iframe's own `window` — same realm as the React tree rendering the
 * factory's component, so no cross-document mounting.
 */
export function instantiateDataAppBundle(
  code: string,
  label: string,
  targetWindow: Window,
): LoadedDataApp {
  const sandbox = createDataAppSandbox(label, targetWindow);
  const factory = sandbox.evaluate(code);

  const def = factory();

  if (!def || typeof def.component !== "function") {
    throw new Error(
      "Factory return value is missing a `component` function (expected { component, theme? })",
    );
  }

  return { component: def.component, theme: def.theme };
}
