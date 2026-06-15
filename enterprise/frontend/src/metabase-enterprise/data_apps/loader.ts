import type * as React from "react";

import type { MetabaseTheme } from "metabase/embedding-sdk/theme";
import { getSubpathSafeUrl } from "metabase/urls";

import { createDataAppSandbox } from "./sandbox";

export interface LoadedDataApp {
  component: React.ComponentType<Record<string, unknown>>;
  theme?: MetabaseTheme;
}

/**
 * Error thrown when a data-app bundle can't be fetched. `status` carries the
 * HTTP status (when the request reached the server) so the UI can tell a
 * not-yet-synced app (404) apart from a genuine failure.
 */
export class DataAppBundleError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "DataAppBundleError";
    this.status = status;
  }
}

/**
 * Fetch a data-app bundle's raw JS source. Called from the iframe-top
 * `DataAppIframeApp` after it reads the `:name` from the URL. Throws a
 * [[DataAppBundleError]] on a transport failure or non-2xx response.
 */
export async function fetchDataAppBundleCode(name: string): Promise<string> {
  const url = getSubpathSafeUrl(
    `/api/data-app/${encodeURIComponent(name)}/bundle?t=${Date.now()}`,
  );

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (e) {
    throw new DataAppBundleError(
      `Failed to reach the server for data-app bundle: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  if (!res.ok) {
    throw new DataAppBundleError(
      `Failed to fetch data-app bundle: HTTP ${res.status}`,
      res.status,
    );
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
