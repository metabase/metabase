/* eslint-disable metabase/no-literal-metabase-strings */

import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import type { SubmitMcpAppsFeedbackRequest } from "metabase-types/api";

type StoreDrillQueryRequest = {
  instanceUrl: string;
  sessionToken: string;
  mcpSessionId: string;
  encodedQuery: string;
};

type StoreDrillQueryResponse = {
  handle: string;
};

type SubmitMcpFeedbackPayload = SubmitMcpAppsFeedbackRequest & {
  instanceUrl: string;
  sessionToken: string;
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
  mcpSessionId,
  encodedQuery,
}: StoreDrillQueryRequest): Promise<StoreDrillQueryResponse> {
  const response = await fetch(`${instanceUrl}/api/embed-mcp/drills`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Metabase-Client": EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
      "X-Metabase-Session": sessionToken,
      "Mcp-Session-Id": mcpSessionId,
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

type FetchQueryByHandleRequest = {
  instanceUrl: string;
  sessionToken: string;
  mcpSessionId: string;
  queryHandle: string;
};

type FetchQueryByHandleResponse = {
  query: string;
  prompt: string | null;
};

/**
 * Exchanges a query handle for the base64-encoded query it stands for.
 *
 * The v2 MCP tools return only a handle, so the query never enters the model's
 * context; the iframe resolves it here with the embedding session token it was
 * rendered with. Access is keyed on that (user, session) pair — a handle on its
 * own is not a bearer credential.
 *
 * We cannot use RTK Query here as we are not in Metabase's React tree.
 */
export async function fetchQueryByHandle({
  instanceUrl,
  sessionToken,
  mcpSessionId,
  queryHandle,
}: FetchQueryByHandleRequest): Promise<FetchQueryByHandleResponse> {
  const response = await fetch(
    `${instanceUrl}/api/embed-mcp/queries/${encodeURIComponent(queryHandle)}`,
    {
      headers: {
        "X-Metabase-Client": EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
        "X-Metabase-Session": sessionToken,
        "Mcp-Session-Id": mcpSessionId,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `fetchQueryByHandle failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

export async function submitMcpFeedback({
  instanceUrl,
  sessionToken,
  mcpSessionId,
  payload,
}: SubmitMcpFeedbackPayload): Promise<void> {
  const response = await fetch(`${instanceUrl}/api/embed-mcp/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Metabase-Client": EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
      "X-Metabase-Session": sessionToken,
      "Mcp-Session-Id": mcpSessionId,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `submitMcpFeedback failed: ${response.status} ${response.statusText}`,
    );
  }
}
