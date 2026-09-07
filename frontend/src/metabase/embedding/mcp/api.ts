/* eslint-disable metabase/no-literal-metabase-strings */

import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import type {
  McpAppsBootstrapResponse,
  SubmitMcpAppsFeedbackRequest,
} from "metabase-types/api";

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

type McpBootstrapRequest = {
  instanceUrl: string;
  uiCredential: string;
  mcpSessionId: string;
};

/**
 * Fetches the user and settings the iframe needs to mount.
 *
 * The UI credential authenticates this endpoint and nothing on the general REST API,
 * so a failure here is the whole app's auth story. The status rides along on the error
 * so the caller can tell "credential rejected" from "MCP is switched off".
 */
export async function fetchMcpBootstrap({
  instanceUrl,
  uiCredential,
  mcpSessionId,
}: McpBootstrapRequest): Promise<McpAppsBootstrapResponse> {
  const response = await fetch(`${instanceUrl}/api/embed-mcp/bootstrap`, {
    method: "GET",
    headers: {
      "X-Metabase-Client": EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
      "X-Metabase-Mcp-Ui-Auth": uiCredential,
      "Mcp-Session-Id": mcpSessionId,
    },
  });

  if (!response.ok) {
    throw Object.assign(
      new Error(
        `fetchMcpBootstrap failed: ${response.status} ${response.statusText}`,
      ),
      { status: response.status },
    );
  }

  return response.json();
}

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
