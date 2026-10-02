import {
  type OnBeforeRequestHandlerConfig,
  PLUGIN_API,
} from "metabase/api/client";

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

export function installMcpAppsRequestOverride() {
  PLUGIN_API.onBeforeRequestHandlers.overrideRequestsForMcpApps =
    overrideRequestForMcpApps;
}
