export interface CustomVizPlugin {
  id: number;
  repo_url: string;
  display_name: string;
  identifier: string;
  status: "pending" | "active" | "error";
  error_message: string | null;
  pinned_version: string | null;
  resolved_commit: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomVizPluginRequest {
  repo_url: string;
  display_name: string;
  access_token?: string;
  pinned_version?: string;
}
