import type * as React from "react";

import { getSubpathSafeUrl } from "metabase/urls";
import type { DataAppId } from "metabase-types/api";

import { type DataAppHostApi, createDataAppSandbox } from "./sandbox";

export interface LoadedDataApp {
  component: React.ComponentType<Record<string, unknown>>;
}

/**
 * Fetch a data-app bundle by name, evaluate it in a Near Membrane sandbox
 * with React + the SDK component set endowed, and return the host-renderable
 * React component the factory produces.
 *
 * `id` is used to scope the sandbox's DOM access — it's compared against the
 * `data-data-app=<id>` attribute on the container element AppView renders
 * around the returned component.
 */
export async function loadDataAppBundle(
  name: string,
  id: DataAppId,
): Promise<LoadedDataApp> {
  const url = getSubpathSafeUrl(
    `/api/ee/data-app/${encodeURIComponent(name)}/bundle?t=${Date.now()}`,
  );
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch data-app bundle: HTTP ${res.status}`);
  }
  const code = await res.text();

  const sandbox = createDataAppSandbox(id);
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
