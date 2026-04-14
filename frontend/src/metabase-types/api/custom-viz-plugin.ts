export interface CustomVizPluginManifest {
  name?: string;
  icon?: string;
  metabase?: {
    version?: string;
  };
  assets?: string[];
}

export type CustomVizPluginId = number;

export interface CustomVizPlugin {
  id: CustomVizPluginId;
  repo_url: string;
  display_name: string;
  identifier: string;
  status: "pending" | "active" | "error";
  enabled: boolean;
  icon: string | null;
  error_message: string | null;
  pinned_version: string | null;
  resolved_commit: string | null;
  dev_bundle_url?: string | null;
  dev_only: boolean;
  manifest?: CustomVizPluginManifest | null;
  metabase_version?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomVizPluginRuntime {
  id: CustomVizPluginId;
  identifier: string;
  display_name: string;
  icon: string | null;
  bundle_url: string;
  resolved_commit: string | null;
  dev_bundle_url?: string | null;
  manifest?: CustomVizPluginManifest | null;
}

export interface CreateCustomVizPluginRequest {
  repo_url: string;
  access_token?: string;
  pinned_version?: string | null;
}

export interface CreateDevCustomVizPluginRequest {
  dev_bundle_url: string;
}

export interface UpdateCustomVizPluginRequest {
  id: CustomVizPluginId;
  enabled?: boolean;
  access_token?: string;
  pinned_version?: string | null;
}
