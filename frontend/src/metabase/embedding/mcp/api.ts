/* eslint-disable metabase/no-literal-metabase-strings */

import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";
import type {
  McpAppsBootstrapResponse,
  SubmitMcpAppsFeedbackRequest,
} from "metabase-types/api";

import type { McpDeriveOperation, McpDrillOperation } from "./derive";

type StoreDrillQueryRequest = {
  instanceUrl: string;
  uiCredential: string;
  mcpSessionId: string;
  queryHandle: string;
  operation: McpDrillOperation;
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
 * Asks the server to derive the drill-through from the handle it was clicked
 * on, and returns the new handle that the iframe threads into the agent
 * message so `render_drill_through` can render it without the LLM ever seeing
 * the query.
 *
 * We cannot use RTK Query here as we are not in Metabase's React tree.
 */
export async function storeDrillQuery({
  instanceUrl,
  uiCredential,
  mcpSessionId,
  queryHandle,
  operation,
}: StoreDrillQueryRequest): Promise<StoreDrillQueryResponse> {
  const response = await fetch(`${instanceUrl}/api/embed-mcp/drills`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Metabase-Client": EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
      "X-Metabase-Mcp-Ui-Auth": uiCredential,
      "Mcp-Session-Id": mcpSessionId,
    },
    body: JSON.stringify({ handle: queryHandle, operation }),
  });

  if (!response.ok) {
    throw new Error(
      `storeDrillQuery failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

type DeriveQueryRequest = {
  instanceUrl: string;
  uiCredential: string;
  mcpSessionId: string;
  queryHandle: string;
  operations: McpDeriveOperation[];
};

export type DerivedQuery = {
  handle: string;
  query: string;
};

/**
 * Asks the server to derive a new query from the one stored under
 * `queryHandle`, and returns the new handle and its base64-encoded query. The
 * iframe names the change; the server builds the query.
 *
 * We cannot use RTK Query here as we are not in Metabase's React tree.
 */
export async function deriveMcpQuery({
  instanceUrl,
  uiCredential,
  mcpSessionId,
  queryHandle,
  operations,
}: DeriveQueryRequest): Promise<DerivedQuery> {
  const response = await fetch(
    `${instanceUrl}/api/embed-mcp/queries/${encodeURIComponent(queryHandle)}/derive`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Metabase-Client": EMBEDDING_SDK_CONFIG.metabaseClientRequestHeader,
        "X-Metabase-Mcp-Ui-Auth": uiCredential,
        "Mcp-Session-Id": mcpSessionId,
      },
      body: JSON.stringify({ operations }),
    },
  );

  if (!response.ok) {
    // The server explains a refused change in a plain-text body. Any other body,
    // such as a JSON validation report, is not for the user.
    const isPlainText = (response.headers.get("Content-Type") ?? "")
      .toLowerCase()
      .startsWith("text/plain");
    const serverMessage = isPlainText
      ? await response.text().catch(() => "")
      : "";

    throw Object.assign(
      new Error(
        `deriveMcpQuery failed: ${response.status} ${response.statusText}`,
      ),
      { status: response.status, serverMessage: serverMessage || undefined },
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
 * rendered with. The lookup is user-scoped and the credential is accepted only
 * on the iframe's own routes, so a handle on its own is not a bearer
 * credential.
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
