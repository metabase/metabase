/**
 * The MCP App iframe's query handle and credential refresh. The iframe runs
 * only queries stored under a handle, so the dataset endpoints read the current
 * handle from here to reach the handle-keyed routes, and renew the credential
 * here when one of those routes refuses it.
 */

export interface McpUiAuth {
  credential: string;
  sessionId: string;
}

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

type McpCredentialRefresher = () => Promise<McpUiAuth>;

let refresher: McpCredentialRefresher | null = null;
let refreshInFlight: Promise<McpUiAuth> | null = null;

/** Set how a fresh UI credential is obtained, or clear it with null. */
export function setMcpCredentialRefresher(
  nextRefresher: McpCredentialRefresher | null,
) {
  refresher = nextRefresher;
}

/**
 * A fresh UI credential. Concurrent calls share one refresh. Rejects when no
 * refresher is set or the refresh fails.
 */
export function refreshMcpCredential(): Promise<McpUiAuth> {
  const currentRefresher = refresher;

  if (!currentRefresher) {
    return Promise.reject(new Error("No MCP UI credential refresher is set."));
  }

  if (!refreshInFlight) {
    refreshInFlight = currentRefresher().finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}
