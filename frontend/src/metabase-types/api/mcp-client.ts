export type McpServerId = number;

export type McpServerProvider = "notion" | "linear" | "custom";

export type McpServerAuthStrategy = "oauth" | "header" | "none";

export type McpConnectionStatus = "pending" | "connected" | "error";

export interface McpConnection {
  id: number;
  status: McpConnectionStatus;
  account: Record<string, unknown> | null;
  scopes: string[] | null;
  expires_at: string | null;
  error: string | null;
  updated_at: string;
}

export interface McpServer {
  id: McpServerId;
  name: string;
  url: string;
  provider: McpServerProvider;
  auth_strategy: McpServerAuthStrategy;
  enabled: boolean;
  has_credentials: boolean;
  created_at: string;
  updated_at: string;
  connection: McpConnection | null;
}

export interface CreateMcpServerRequest {
  name: string;
  url: string;
  provider: McpServerProvider;
  auth_strategy: McpServerAuthStrategy;
  enabled?: boolean;
  header_name?: string | null;
  header_value?: string | null;
}

export type UpdateMcpServerRequest = { id: McpServerId } & Partial<
  Omit<CreateMcpServerRequest, "provider">
>;

export interface ConnectMcpServerResponse {
  redirect_url: string | null;
  connection: McpConnection;
}

export interface McpServerTool {
  name: string;
  title?: string;
  description?: string;
}

export interface ListMcpServerToolsResponse {
  tools: McpServerTool[];
}
