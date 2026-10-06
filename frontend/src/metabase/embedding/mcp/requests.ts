import {
  type OnBeforeRequestHandlerConfig,
  PLUGIN_API,
  api,
} from "metabase/api/client";

import { refreshMcpCredential } from "./auth/credentialRefresh";

/**
 * The ad-hoc query routes the SDK question calls, and the handle-keyed iframe
 * route each one becomes. The iframe's credential authenticates only the
 * handle routes, which run the query stored under the handle and ignore any
 * query in the request body.
 */
const HANDLE_ROUTES: Record<string, string> = {
  "/api/dataset": "run",
  "/api/dataset/pivot": "pivot",
  "/api/dataset/query_metadata": "query_metadata",
  "/api/dataset/parameter/remapping": "parameter/remapping",
};

let currentQueryHandle: string | null = null;

/** Set the handle whose stored query the iframe's question is showing. */
export function setCurrentMcpQueryHandle(handle: string | null) {
  currentQueryHandle = handle;
}

export function getCurrentMcpQueryHandle(): string | null {
  return currentQueryHandle;
}

export async function overrideRequestForMcpApps({
  method,
  url,
}: Pick<OnBeforeRequestHandlerConfig, "method" | "url">) {
  const route = method === "POST" ? HANDLE_ROUTES[url] : undefined;

  if (route && currentQueryHandle) {
    return {
      url: `/api/embed-mcp/queries/${encodeURIComponent(currentQueryHandle)}/${route}`,
    };
  }
}

/**
 * Gets a new UI credential when an iframe route at `url` refused the current
 * one, so the next request is authenticated. The refused request itself is not
 * retried: the shared API client has no hook to resend it.
 */
export function refreshOnRefusedIframeRequest(url: string) {
  if (url.startsWith("/api/embed-mcp/")) {
    refreshMcpCredential().catch((error) => {
      console.error("Error refreshing the MCP UI credential", error);
    });
  }
}

export function installMcpAppsRequestOverride() {
  PLUGIN_API.onBeforeRequestHandlers.overrideRequestsForMcpApps =
    overrideRequestForMcpApps;
  api.on(401, refreshOnRefusedIframeRequest);
}
