import {
  type OnBeforeRequestHandlerConfig,
  PLUGIN_API,
  type RefusedRequest,
  setRefusedRequestHandler,
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

/** Counts the handles set from outside a derive, such as a new tool result. */
let queryHandleGeneration = 0;

/**
 * Set the handle whose stored query the iframe's question is showing, for a
 * new tool result. A derive in progress started from an older one.
 */
export function setCurrentMcpQueryHandle(handle: string | null) {
  currentQueryHandle = handle;
  queryHandleGeneration += 1;
}

/** Set the current handle to one a derive produced from it, or back after a failed derive. */
export function advanceCurrentMcpQueryHandle(handle: string | null) {
  currentQueryHandle = handle;
}

/** Changes whenever `setCurrentMcpQueryHandle` replaces the current handle. */
export function getMcpQueryHandleGeneration(): number {
  return queryHandleGeneration;
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
 * Whether to resend a request the server refused: true for an iframe route,
 * after getting a new UI credential, which the resent request carries.
 */
async function resendRefusedIframeRequest({
  url,
}: RefusedRequest): Promise<boolean> {
  if (!url.startsWith("/api/embed-mcp/")) {
    return false;
  }

  try {
    await refreshMcpCredential();
    return true;
  } catch (error) {
    console.error("Error refreshing the MCP UI credential", error);
    return false;
  }
}

export function installMcpAppsRequestOverride() {
  PLUGIN_API.onBeforeRequestHandlers.overrideRequestsForMcpApps =
    overrideRequestForMcpApps;
  setRefusedRequestHandler(resendRefusedIframeRequest);
}
