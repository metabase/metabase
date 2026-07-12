/* eslint-disable metabase/no-literal-metabase-strings */

import type { McpAppsFeedback } from "metabase-types/api";

type StoreDrillQueryRequest = {
  instanceUrl: string;
  sessionToken: string;
  encodedQuery: string;
};

type StoreDrillQueryResponse = {
  handle: string;
};

type SubmitMcpFeedbackPayload = {
  instanceUrl: string;
  sessionToken: string;
  payload: McpAppsFeedback;
};

/**
 * Stores the drill-through's query on the server and returns a handle UUID
 * that the iframe threads into the agent message so `render_drill_through`
 * can fetch the payload without the LLM ever seeing it.
 *
 * We cannot use RTK Query here as we are not in Metabase's React tree.
 */
export async function storeDrillQuery({
  instanceUrl,
  sessionToken,
  encodedQuery,
}: StoreDrillQueryRequest): Promise<StoreDrillQueryResponse> {
  const response = await fetch(`${instanceUrl}/api/embed-mcp/drills`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Metabase-Client": "mcp-apps",
      "X-Metabase-Session": sessionToken,
    },
    body: JSON.stringify({ encodedQuery }),
  });

  if (!response.ok) {
    throw new Error(
      `storeDrillQuery failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

export async function submitMcpFeedback({
  instanceUrl,
  sessionToken,
  payload,
}: SubmitMcpFeedbackPayload): Promise<void> {
  const response = await fetch(`${instanceUrl}/api/embed-mcp/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Metabase-Client": "mcp-apps",
      "X-Metabase-Session": sessionToken,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `submitMcpFeedback failed: ${response.status} ${response.statusText}`,
    );
  }
}
