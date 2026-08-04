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
 *
 * Mirrors `WidgetMountHandle` from the custom-viz plugin sdk
 * (enterprise/frontend/src/custom-viz/src/types/viz-settings.ts) so app code
 * doesn't import the sdk package; the two must stay structurally identical.
 */
export type WidgetMountHandle<TProps> = {
  update(props: TProps): void;
  unmount(): void;
};

/**
 * Mount adapter for a custom-component setting widget: the host gives the
 * plugin a container element, the plugin renders into it with its own React
 * instance and returns a handle the host can `update` / `unmount`.
 *
 * Mirrors `WidgetMount` from the custom-viz plugin sdk; see
 * {@link WidgetMountHandle}.
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
