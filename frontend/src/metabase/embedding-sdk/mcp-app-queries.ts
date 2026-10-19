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

const REFRESH_REUSE_MS = 10_000;

let refresher: McpCredentialRefresher | null = null;
let lastRefresh: { auth: Promise<McpUiAuth>; startedAt: number } | null = null;

/** Set how a fresh UI credential is obtained, or clear it with null. */
export function setMcpCredentialRefresher(
  nextRefresher: McpCredentialRefresher | null,
) {
  refresher = nextRefresher;
  lastRefresh = null;
}

/**
 * A fresh UI credential. Every call within ten seconds of a refresh shares that
 * refresh, so a credential the server refuses as soon as it is issued ends in
 * the refusal rather than in a loop of refreshes. Rejects when no refresher is
 * set or the refresh fails.
 */
export function refreshMcpCredential(): Promise<McpUiAuth> {
  if (!refresher) {
    return Promise.reject(new Error("No MCP UI credential refresher is set."));
  }

  if (!lastRefresh || Date.now() - lastRefresh.startedAt >= REFRESH_REUSE_MS) {
    lastRefresh = { auth: refresher(), startedAt: Date.now() };
  }

  return lastRefresh.auth;
}
