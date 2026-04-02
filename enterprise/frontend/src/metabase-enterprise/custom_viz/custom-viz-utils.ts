import type { OptionsType } from "metabase/lib/formatting/types";
import { formatValue as internalFormatValue } from "metabase/lib/formatting/value";
import type {
  CustomVizDisplayType,
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

export function getPluginAssetUrl(
  pluginId: number,
  assetPath: string | null,
): string | undefined {
  if (!assetPath) {
    return undefined;
  }
  return `/api/ee/custom-viz-plugin/${pluginId}/asset?path=${encodeURIComponent(assetPath)}`;
}

export function getCustomPluginIdentifier(
  pluginOrIdentifier: Pick<CustomVizPluginRuntime, "identifier"> | string,
): VisualizationDisplay {
  const identifier =
    typeof pluginOrIdentifier === "string"
      ? pluginOrIdentifier
      : pluginOrIdentifier.identifier;

  return `custom:${identifier}` as VisualizationDisplay;
}

export const isCustomVizDisplay = (
  value: unknown,
): value is CustomVizDisplayType =>
  typeof value === "string" && value.startsWith("custom:");
