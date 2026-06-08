import type * as React from "react";

import { getSubpathSafeUrl } from "metabase/urls";
import type { DataAppId } from "metabase-types/api";

import { type DataAppHostApi, createDataAppSandbox } from "./sandbox";

export interface LoadedDataApp {
  component: React.ComponentType<Record<string, unknown>>;
}

/**
 * Fetch a data-app bundle's raw JS source. Pulled out from
 * [[loadDataAppBundle]] so the parent React tree can fetch the bundle in
 * parallel with iframe bootstrap, then instantiate the sandbox once the
 * iframe is ready and its `contentWindow` exists.
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
 * Build a Near Membrane sandbox bound to `targetWindow` (the iframe's
 * `contentWindow`), evaluate the bundle inside it, and return the React
 * component the factory produces. DOM mutations from the sandbox land in
 * `targetWindow.document`.
 *
 * Endowments (React, SDK components, hooks) come from the parent's module
 * graph — they're passed across by reference. `MetabaseProvider` and the
 * Redux store stay singletons in the parent so auth, theming, and store
 * state don't fragment per app instance.
 */
export function instantiateDataAppBundle(
  code: string,
  id: DataAppId,
  targetWindow: Window,
): LoadedDataApp {
  const sandbox = createDataAppSandbox(id, targetWindow);
  const factory = sandbox.evaluate(code);

  const hostApi: DataAppHostApi = {};
  const def = factory(hostApi);
  if (!def || typeof def.component !== "function") {
    throw new Error(
      "Factory return value is missing a `component` function (expected { component })",
    );
  }
  return { component: def.component };
}

/**
 * Convenience wrapper for in-host (non-iframe) mounts: fetch the bundle and
 * instantiate it in the current window. Used by anything that wants the
 * old, pre-iframe rendering shape.
 */
export async function loadDataAppBundle(
  name: string,
  id: DataAppId,
): Promise<LoadedDataApp> {
  const code = await fetchDataAppBundleCode(name);
  return instantiateDataAppBundle(code, id, window);
}
