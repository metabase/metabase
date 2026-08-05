export interface McpMetabaseConfig {
  instanceUrl?: string;
  uiCredential?: string;
  mcpSessionId?: string;
}

export const getMcpMetabaseConfig = (): McpMetabaseConfig =>
  // The global type does not include the MCP Apps fields injected into the iframe.
  (window.metabaseConfig as McpMetabaseConfig | undefined) ?? {};
