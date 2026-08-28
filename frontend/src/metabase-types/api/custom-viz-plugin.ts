export interface CustomVizPluginManifest {
  name?: string;
  icon?: string;
  metabase?: {
    version?: string;
  };
  sdk?: {
    version?: string;
  };
}

export type CustomVizPluginId = number;

export interface CustomVizPlugin {
  id: CustomVizPluginId;
  display_name: string;
  identifier: string;
  status: "pending" | "active" | "error";
  enabled: boolean;
  icon: string | null;
  error_message: string | null;
  bundle_hash?: string | null;
  dev_bundle_url?: string | null;
  dev_only: boolean;
  manifest?: CustomVizPluginManifest | null;
  warnings: CustomVizPluginWarning[];
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
  bundle_hash?: string | null;
  dev_bundle_url?: string | null;
  manifest?: CustomVizPluginManifest | null;
  warnings: CustomVizPluginWarning[];
}

export type CustomVizPluginWarning =
  | {
      type: "sdk-version-mismatch";
      sdk_version: string | null;
      tested_sdk_range: string;
    }
  | {
      type: "metabase-version-mismatch";
      metabase_version: string;
      current_version: string;
    };

export interface CreateCustomVizPluginRequest {
  file: File;
}

export interface CreateDevCustomVizPluginRequest {
  dev_bundle_url: string;
}

export interface UpdateCustomVizPluginRequest {
  id: CustomVizPluginId;
  enabled?: boolean;
}

export interface ReplaceCustomVizPluginBundleRequest {
  id: CustomVizPluginId;
  file: File;
}
