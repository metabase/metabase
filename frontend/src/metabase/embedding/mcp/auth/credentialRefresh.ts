import type { McpUiAuth } from "./mcpUiAuth";

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
