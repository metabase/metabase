/* eslint-disable metabase/no-literal-metabase-strings */

import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import type { SubmitMcpAppsFeedbackRequest } from "metabase-types/api";

type StoreDrillQueryRequest = {
  instanceUrl: string;
  uiCredential: string;
  mcpSessionId: string;
  encodedQuery: string;
};

type StoreDrillQueryResponse = {
  query_handle: string;
};

type ResolveMcpQueryRequest = {
  instanceUrl: string;
  uiCredential: string;
  mcpSessionId: string;
  queryHandle: string;
};

type ResolveMcpQueryResponse = {
  query: string;
  prompt?: string;
};

type SubmitMcpFeedbackPayload = SubmitMcpAppsFeedbackRequest & {
  instanceUrl: string;
  uiCredential: string;
};

/**
 * Stores the drill-through's query on the server and returns a query handle UUID
 * that the iframe threads into the agent message so `render_drill_through`
 * can fetch the payload without the LLM ever seeing it.
 *
 * We cannot use RTK Query here as we are not in Metabase's React tree.
 */
export async function storeDrillQuery({
  instanceUrl,
  uiCredential,
  mcpSessionId,
  encodedQuery,
}: StoreDrillQueryRequest): Promise<StoreDrillQueryResponse> {
  const response = await fetch(`${instanceUrl}/api/embed-mcp/drills`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Metabase-Client": EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
      "X-Metabase-Mcp-Ui-Auth": uiCredential,
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

export async function resolveMcpQueryHandle({
  instanceUrl,
  uiCredential,
  mcpSessionId,
  queryHandle,
}: ResolveMcpQueryRequest): Promise<ResolveMcpQueryResponse> {
  const response = await fetch(
    `${instanceUrl}/api/embed-mcp/query-handle/resolve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Metabase-Client": EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
        "X-Metabase-Mcp-Ui-Auth": uiCredential,
        "Mcp-Session-Id": mcpSessionId,
      },
      body: JSON.stringify({ query_handle: queryHandle }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `resolveMcpQueryHandle failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

export async function submitMcpFeedback({
  instanceUrl,
  uiCredential,
  mcpSessionId,
  payload,
}: SubmitMcpFeedbackPayload): Promise<void> {
  const response = await fetch(`${instanceUrl}/api/embed-mcp/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Metabase-Client": EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
      "X-Metabase-Mcp-Ui-Auth": uiCredential,
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
