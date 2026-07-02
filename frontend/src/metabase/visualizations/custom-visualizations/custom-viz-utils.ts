import { getSubpathSafeUrl } from "metabase/urls";
import type { OptionsType } from "metabase/utils/formatting/types";
import { formatValue as internalFormatValue } from "metabase/visualizations/lib/formatting/value";
import type {
  CustomVizPluginId,
  CustomVizPluginRuntime,
  VisualizationDisplay,
} from "metabase-types/api";

export function formatValue(value: unknown, options?: OptionsType): string {
  const result = internalFormatValue(value, {
    ...options,
    jsx: false,
  });
  return String(result ?? "");
}

/**
 * Build a URL for a plugin's static asset.
 */
export function getPluginAssetUrl(
  pluginId: CustomVizPluginId,
  assetPath: string | null | undefined,
): string | undefined {
  if (!assetPath) {
    return undefined;
  }
  return getSubpathSafeUrl(
    `/api/ee/custom-viz-plugin/${pluginId}/asset?path=${encodeURIComponent(assetPath)}`,
  );
}

/**
 * Plain same-origin asset URL. The SDK overrides this to fetch the asset with auth headers and return a blob.
 */
export function resolveCustomVizAssetUrl(
  pluginId: CustomVizPluginId,
  assetPath: string | null | undefined,
): Promise<string | undefined> {
  return Promise.resolve(getPluginAssetUrl(pluginId, assetPath));
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
