/* eslint-disable metabase/no-literal-metabase-strings */

type StoreDrillQueryRequest = {
  instanceUrl: string;
  sessionToken: string;
  mcpSessionId: string;
  encodedQuery: string;
};

/**
 * Stores the drill-through's query on the server,
 * keyed by the MCP session ID.
 *
 * We cannot use RTK Query here as we are not in
 * Metabase's React tree.
 */
export async function storeDrillQuery({
  instanceUrl,
  sessionToken,
  mcpSessionId,
  encodedQuery,
}: StoreDrillQueryRequest): Promise<void> {
  const response = await fetch(`${instanceUrl}/api/mcp/ui/drills`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Metabase-Session": sessionToken,
    },
    body: JSON.stringify({
      encodedQuery,
      mcpSessionId,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `storeDrillQuery failed: ${response.status} ${response.statusText}`,
    );
  }
}
