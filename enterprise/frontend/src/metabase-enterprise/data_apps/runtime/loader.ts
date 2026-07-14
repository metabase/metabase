import * as React from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as ReactDOM from "react-dom";
import * as ReactDOMClient from "react-dom/client";
import * as ReactDOMServer from "react-dom/server";
import { pick } from "underscore";

import * as sdkExports from "embedding-sdk-package";
import * as dataAppExports from "embedding-sdk-package/data-app";
import { getSubpathSafeUrl } from "metabase/urls";
import { createDataAppSandbox } from "metabase-enterprise/data_apps/sandbox/sandbox";
import {
  DATA_APP_PROVIDER_PROP_KEYS,
  type DataAppMetabaseProviderProps,
} from "metabase-enterprise/data_apps/sandbox/types";

export interface LoadedDataApp {
  component: React.ComponentType<Record<string, unknown>>;
  providerProps: DataAppMetabaseProviderProps;
}

/** Response carrying the bundle source plus the app's fetch/XHR allowlist. */
export interface FetchedDataAppBundle {
  code: string;
  /** Origins the sandboxed bundle may fetch/XHR (from `data_app.yml`). */
  allowedHosts: string[];
}

/**
 * Header the bundle endpoint sets with the app's `allowed_hosts` (JSON array).
 * Drives the sandbox's fetch/XHR allowlist — see `sandbox/allowed-hosts.ts`.
 */
// eslint-disable-next-line metabase/no-literal-metabase-strings -- HTTP response header name, not user-facing
const ALLOWED_HOSTS_HEADER = "X-Metabase-Data-App-Allowed-Hosts";

const parseAllowedHostsHeader = (res: Response): string[] => {
  const raw = res.headers.get(ALLOWED_HOSTS_HEADER);

  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed.filter((h): h is string => typeof h === "string")
      : [];
  } catch {
    return [];
  }
};

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
 * Fetch a data-app bundle's raw JS source plus its fetch/XHR allowlist. Called
 * from the iframe-top `DataAppIframeApp` after it reads the `:name` from the
 * URL. Throws a [[DataAppBundleError]] on a transport failure or non-2xx
 * response.
 */
export const fetchDataAppBundleCode = async (
  name: string,
): Promise<FetchedDataAppBundle> => {
  const url = getSubpathSafeUrl(
    `/api/apps/${encodeURIComponent(name)}/bundle?t=${Date.now()}`,
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

  return { code: await res.text(), allowedHosts: parseAllowedHostsHeader(res) };
};

/**
 * Build a Near Membrane sandbox bound to `targetWindow` and evaluate the
 * bundle inside it. With the iframe-top app architecture, `targetWindow` is
 * the iframe's own `window` — same realm as the React tree rendering the
 * factory's component, so no cross-document mounting.
 */
export const instantiateDataAppBundle = (
  code: string,
  label: string,
  targetWindow: Window,
  allowedHosts: string[] = [],
): LoadedDataApp => {
  const sandbox = createDataAppSandbox({
    label,
    targetWindow,
    allowedHosts,
    endowments: {
      React,
      reactDom: ReactDOM,
      reactDomClient: ReactDOMClient,
      reactDomServer: ReactDOMServer,
      reactJsxRuntime: ReactJsxRuntime,
      sdkExports,
      dataAppExports,
    },
  });
  const factory = sandbox.evaluate(code);

  const def = factory();

  if (!def || typeof def.component !== "function") {
    throw new Error(
      "Factory return value is missing a `component` function (expected { component, providerProps? })",
    );
  }

  const providerProps = pick(
    def.providerProps ?? {},
    ...DATA_APP_PROVIDER_PROP_KEYS,
  );

  return { component: def.component, providerProps };
};
