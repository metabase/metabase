import type * as React from "react";

import { getSubpathSafeUrl } from "metabase/urls";

import { type DataAppHostApi, createDataAppSandbox } from "./sandbox";

export interface LoadedDataApp {
  component: React.ComponentType<Record<string, unknown>>;
}

/**
 * Fetch a data-app bundle by name, evaluate it in a Near Membrane sandbox
 * with React + the SDK component set endowed, and return the host-renderable
 * React component the factory produces.
 */
export async function loadDataAppBundle(name: string): Promise<LoadedDataApp> {
  const url = getSubpathSafeUrl(
    `/api/ee/data-app/${encodeURIComponent(name)}/bundle?t=${Date.now()}`,
  );
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch data-app bundle: HTTP ${res.status}`);
  }
  const code = await res.text();

  const sandbox = createDataAppSandbox();
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
