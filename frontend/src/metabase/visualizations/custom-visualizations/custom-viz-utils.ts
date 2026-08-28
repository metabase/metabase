import { getSubpathSafeUrl } from "metabase/urls";
import { formatValue as internalFormatValue } from "metabase/value-formatting";
import type {
  ColumnSettings,
  CustomVizDisplayType,
  CustomVizPluginId,
  CustomVizPluginRuntime,
} from "metabase-types/api";

import { isCustomVizSettingKey } from "./setting-keys";

export function formatValue(value: unknown, options?: ColumnSettings): string {
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
): CustomVizDisplayType {
  const identifier =
    typeof pluginOrIdentifier === "string"
      ? pluginOrIdentifier
      : pluginOrIdentifier.identifier;

  return `custom:${identifier}`;
}

export const defineSetting = <T>(definition: T) => definition;

// The plugin sees host settings plus its own without the prefix; a same-named plugin setting shadows the host one.
export function toPluginSettings<T>(
  settings: Record<string, T>,
  prefix: string,
): Record<string, T> {
  const entries = Object.entries(settings);
  const hostEntries = entries.filter(([key]) => !isCustomVizSettingKey(key));
  const pluginEntries = entries
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => [key.slice(prefix.length), value]);
  return Object.fromEntries([...hostEntries, ...pluginEntries]);
}

export function toHostSettingKeys<T>(
  settings: Record<string, T>,
  prefix: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [`${prefix}${key}`, value]),
  );
}
