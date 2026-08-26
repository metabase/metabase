import { PLUGIN_API } from "metabase/api/client";

const MCP_UI_CREDENTIAL_META_KEY = "com.metabase/mcp-apps";

export interface McpUiAuth {
  credential: string;
  refreshTool: string;
  sessionId: string;
}

export function getMcpUiAuth(
  meta: Record<string, unknown> | undefined,
): McpUiAuth | null {
  const value = meta?.[MCP_UI_CREDENTIAL_META_KEY];

  if (typeof value !== "object" || value === null) {
    return null;
  }

  const credential = "credential" in value ? value.credential : null;
  const refreshTool = "refreshTool" in value ? value.refreshTool : null;
  const sessionId = "sessionId" in value ? value.sessionId : null;

  if (
    typeof credential !== "string" ||
    typeof refreshTool !== "string" ||
    typeof sessionId !== "string"
  ) {
    return null;
  }

  return { credential, refreshTool, sessionId };
}

export function installMcpUiCredential(credential: string) {
  PLUGIN_API.onBeforeRequestHandlers.setEmbeddingRequestAuthHeaders =
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- request header name
    async () => ({ headers: { "X-Metabase-Mcp-Ui-Auth": credential } });
}
