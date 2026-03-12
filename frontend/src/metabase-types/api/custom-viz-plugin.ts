export interface CustomVizPlugin {
  id: number;
  repo_url: string;
  display_name: string;
  identifier: string;
  status: "pending" | "active" | "error";
  enabled: boolean;
  icon: string | null;
  error_message: string | null;
  pinned_version: string | null;
  resolved_commit: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomVizPluginRuntime {
  id: number;
  identifier: string;
  display_name: string;
  icon: string | null;
  bundle_url: string;
}

export interface CreateCustomVizPluginRequest {
  repo_url: string;
  display_name: string;
  icon?: string | null;
  access_token?: string;
  pinned_version?: string | null;
}

export interface UpdateCustomVizPluginRequest {
  id: number;
  enabled?: boolean;
  display_name?: string;
  icon?: string | null;
  access_token?: string;
  pinned_version?: string | null;
}
