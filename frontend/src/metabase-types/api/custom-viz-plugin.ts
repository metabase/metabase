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

/**
 * Handle returned by a custom widget's mount call.
 * Mirrors `WidgetMountHandle` in the custom-viz plugin sdk, and the two copies must stay structurally identical.
 */
export type WidgetMountHandle<TProps> = {
  update(props: TProps): void;
  unmount(): void;
};

/**
 * Mount adapter for a custom-component setting widget: the host gives the plugin a container element,
 * and the plugin renders into it with its own React instance.
 * Mirrors `WidgetMount` in the custom-viz plugin sdk, and the two copies must stay structurally identical.
 */
export type WidgetMount<TProps = Record<string, unknown>> = (
  container: Element,
  initialProps: TProps,
) => WidgetMountHandle<TProps>;

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
