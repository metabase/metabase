export interface CustomVizPluginManifest {
  name?: string;
  icon?: string;
  metabase?: {
    min_version?: number;
    max_version?: number;
  };
  assets?: string[];
}

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
  dev_bundle_url?: string | null;
  manifest?: CustomVizPluginManifest | null;
  min_metabase_version?: number | null;
  max_metabase_version?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CustomVizPluginRuntime {
  id: number;
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
  display_name?: string;
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
