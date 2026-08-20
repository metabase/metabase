import { getSubpathSafeUrl } from "metabase/urls";
import { formatValue as internalFormatValue } from "metabase/value-formatting";
import type {
  ColumnSettings,
  CustomVizPluginId,
  CustomVizPluginRuntime,
  VisualizationDisplay,
} from "metabase-types/api";

export function formatValue(value: unknown, options?: ColumnSettings): string {
  const result = internalFormatValue(value, {
    ...options,
    jsx: false,
  });
  return String(result ?? "");
}

/**
 * Build a URL for a plugin's static asset.
 *
 * A dev plugin has no uploaded bundle for Metabase to serve from, so its icon comes straight from the dev
 * server. That origin is in the superuser document's CSP `img-src` alongside `connect-src` — see
 * `metabase-enterprise.custom-viz-plugin.csp`.
 */
export function getPluginAssetUrl(
  pluginId: CustomVizPluginId,
  assetPath: string | null | undefined,
  devBundleUrl?: string | null,
): string | undefined {
  if (!assetPath) {
    return undefined;
  }
  if (devBundleUrl) {
    return `${devBundleUrl.replace(/\/+$/, "")}/assets/${encodeURIComponent(assetPath)}`;
  }
  return getSubpathSafeUrl(
    `/api/ee/custom-viz-plugin/${pluginId}/asset?path=${encodeURIComponent(assetPath)}`,
  );
}

/**
 * Plain asset URL. The SDK overrides this to fetch the asset with auth headers and return a blob.
 */
export function resolveCustomVizAssetUrl(
  pluginId: CustomVizPluginId,
  assetPath: string | null | undefined,
  devBundleUrl?: string | null,
): Promise<string | undefined> {
  return Promise.resolve(getPluginAssetUrl(pluginId, assetPath, devBundleUrl));
}

export function getCustomPluginIdentifier(
  pluginOrIdentifier: Pick<CustomVizPluginRuntime, "identifier"> | string,
): VisualizationDisplay {
  const identifier =
    typeof pluginOrIdentifier === "string"
      ? pluginOrIdentifier
      : pluginOrIdentifier.identifier;

  return `custom:${identifier}`;
}

export const defineSetting = <T>(definition: T) => definition;
