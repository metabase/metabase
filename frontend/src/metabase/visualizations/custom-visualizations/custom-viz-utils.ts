import { getSubpathSafeUrl } from "metabase/urls";
import { formatNumber } from "metabase/utils/formatting";
import { formatValue as internalFormatValue } from "metabase/value-formatting";
import type {
  ColumnSettings,
  CustomVizDisplayType,
  CustomVizPluginId,
  CustomVizPluginRuntime,
} from "metabase-types/api";

const NUMBER_OPTION_KEYS = [
  "number_style",
  "decimals",
  "currency",
  "currency_style",
  "compact",
  "scale",
  "number_separators",
  "negativeInParentheses",
] as const;

const hasNumberOptions = (options: ColumnSettings) =>
  NUMBER_OPTION_KEYS.some((key) => options[key] !== undefined);

export function formatValue(value: unknown, options?: ColumnSettings): string {
  if (
    options &&
    !options.column &&
    (typeof value === "number" || typeof value === "bigint") &&
    hasNumberOptions(options)
  ) {
    const { prefix = "", suffix = "" } = options;
    return `${prefix}${formatNumber(value, options)}${suffix}`;
  }
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
