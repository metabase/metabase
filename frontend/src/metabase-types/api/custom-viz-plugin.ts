export interface CustomVizPluginManifest {
  name?: string;
  icon?: string;
  metabase?: {
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
}

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

/**
 * Structural mirror of `WidgetMountHandle` from the standalone custom-viz SDK.
 * Keep in sync with enterprise/frontend/src/custom-viz/src/types/viz-settings.ts.
 *
 * Deliberately duplicated (like `VisualizationGridSize`) so OSS code doesn't
 * depend on the "custom-viz" package entry; structural typing keeps the two
 * declarations assignable.
 *
 * Handle returned by a custom widget's mount call. The host drives the
 * widget's lifecycle through this handle: `update` pushes fresh props after
 * re-renders, `unmount` tears down the widget's React tree.
 */
export type WidgetMountHandle<TProps> = {
  update(props: TProps): void;
  unmount(): void;
};

/**
 * Structural mirror of `WidgetMount` from the standalone custom-viz SDK.
 * Keep in sync with enterprise/frontend/src/custom-viz/src/types/viz-settings.ts.
 *
 * Mount adapter for a custom-component setting widget. When a setting's
 * `widget` is a React component, the host wraps it into a `WidgetMount` so it
 * renders within the plugin's sandbox. The host gives the plugin a container
 * element; the plugin renders into it using its own React instance and returns
 * a handle the host can `update` / `unmount`.
 */
export type WidgetMount<TProps = Record<string, unknown>> = (
  container: Element,
  initialProps: TProps,
) => WidgetMountHandle<TProps>;
