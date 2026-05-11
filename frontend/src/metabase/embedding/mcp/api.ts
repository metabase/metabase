/* eslint-disable metabase/no-literal-metabase-strings */

type StoreDrillQueryRequest = {
  instanceUrl: string;
  sessionToken: string;
  mcpSessionId: string;
  encodedQuery: string;
};

type StoreDrillQueryResponse = {
  handle: string;
};

export type McpViewContextView = {
  viewId: string;
  role: "main" | "drill";
  active: boolean;
  name: string;
  display?: string;
  encodedQuery?: string;
  nextCard?: {
    name?: string | null;
    display?: string;
    dataset_query?: unknown;
    visualization_settings?: unknown;
  };
};

export type McpStoredViewContextView = Omit<
  McpViewContextView,
  "encodedQuery"
> & {
  query_handle?: string;
};

export type McpViewContextPayload = {
  viewInstanceId: string;
  activeViewRole: "main" | "drill";
  visibleViews: McpViewContextView[];
  recentViews: McpViewContextView[];
};

export type McpStoredViewContextPayload = Omit<
  McpViewContextPayload,
  "visibleViews" | "recentViews"
> & {
  visibleViews: McpStoredViewContextView[];
  recentViews: McpStoredViewContextView[];
};

type StoreMcpViewContextRequest = {
  instanceUrl: string;
  sessionToken: string;
  mcpSessionId: string;
  context: McpViewContextPayload;
};

type StoreMcpViewContextResponse = {
  context: McpStoredViewContextPayload;
  contexts: McpStoredViewContextPayload[];
};

type DeleteMcpViewContextRequest = {
  instanceUrl: string;
  sessionToken: string;
  mcpSessionId: string;
  viewInstanceId: string;
};

type TouchMcpViewContextRequest = DeleteMcpViewContextRequest;

type TouchMcpViewContextResponse = {
  contexts: McpStoredViewContextPayload[];
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
      "X-Metabase-Client": "mcp-apps",
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

export async function storeMcpViewContext({
  instanceUrl,
  sessionToken,
  mcpSessionId,
  context,
}: StoreMcpViewContextRequest): Promise<StoreMcpViewContextResponse> {
  const response = await fetch(`${instanceUrl}/api/embed-mcp/context`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Metabase-Client": "mcp-apps",
      "X-Metabase-Session": sessionToken,
      "Mcp-Session-Id": mcpSessionId,
    },
    body: JSON.stringify(context),
  });

  if (!response.ok) {
    throw new Error(
      `storeMcpViewContext failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

export async function deleteMcpViewContext({
  instanceUrl,
  sessionToken,
  mcpSessionId,
  viewInstanceId,
}: DeleteMcpViewContextRequest): Promise<void> {
  const response = await fetch(
    `${instanceUrl}/api/embed-mcp/context/${viewInstanceId}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-Metabase-Client": "mcp-apps",
        "X-Metabase-Session": sessionToken,
        "Mcp-Session-Id": mcpSessionId,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `deleteMcpViewContext failed: ${response.status} ${response.statusText}`,
    );
  }
}

export async function touchMcpViewContext({
  instanceUrl,
  sessionToken,
  mcpSessionId,
  viewInstanceId,
}: TouchMcpViewContextRequest): Promise<TouchMcpViewContextResponse> {
  const response = await fetch(
    `${instanceUrl}/api/embed-mcp/context/${viewInstanceId}/touch`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Metabase-Client": "mcp-apps",
        "X-Metabase-Session": sessionToken,
        "Mcp-Session-Id": mcpSessionId,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `touchMcpViewContext failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}
