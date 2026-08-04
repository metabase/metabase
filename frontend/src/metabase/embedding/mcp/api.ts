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
  handle: string;
};

type SubmitMcpFeedbackPayload = SubmitMcpAppsFeedbackRequest & {
  instanceUrl: string;
  uiCredential: string;
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

type FetchQueryByHandleRequest = {
  instanceUrl: string;
  uiCredential: string;
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
 * context; the iframe resolves it here with the scoped UI credential it was
 * rendered with. Access is keyed on that (user, session) pair — a handle on its
 * own is not a bearer credential.
 *
 * We cannot use RTK Query here as we are not in Metabase's React tree.
 */
export async function fetchQueryByHandle({
  instanceUrl,
  uiCredential,
  mcpSessionId,
  queryHandle,
}: FetchQueryByHandleRequest): Promise<FetchQueryByHandleResponse> {
  const response = await fetch(
    `${instanceUrl}/api/embed-mcp/queries/${encodeURIComponent(queryHandle)}`,
    {
      headers: {
        "X-Metabase-Client": EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
        "X-Metabase-Mcp-Ui-Auth": uiCredential,
        "Mcp-Session-Id": mcpSessionId,
      },
    },
  );

  if (!response.ok) {
    // `status` carries the reason the iframe shows the user — an expired handle
    // and an unreachable instance need different messages.
    throw Object.assign(
      new Error(
        `fetchQueryByHandle failed: ${response.status} ${response.statusText}`,
      ),
      { status: response.status },
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
