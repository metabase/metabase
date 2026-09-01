import type { CustomVisualizationProps } from "custom-viz";

import { clone } from "metabase/utils/clone";
import { isCustomVizSettingKey } from "metabase/visualizations/custom-visualizations/setting-keys";
import type { Series, VisualizationSettings } from "metabase-types/api";

type PluginProps = CustomVisualizationProps<Record<string, unknown>>;

export type PluginSeries = PluginProps["series"];

export type PluginSettings = PluginProps["settings"];

const pluginSeriesCache = new WeakMap<Series, PluginSeries>();
// Keyed by prefix so translating one settings object for two plugins doesn't evict the other.
const pluginSettingsCache = new WeakMap<
  VisualizationSettings,
  Map<string, PluginSettings>
>();

// Sandbox proxies could write through to redux state, so the plugin gets a copy.
export function toPluginSeries(series: Series): PluginSeries {
  const cached = pluginSeriesCache.get(series);

  if (cached) {
    return cached;
  }

  const pluginSeries = series.map((single) => structuredClone(single));
  pluginSeriesCache.set(series, pluginSeries);

  return pluginSeries;
}

// The plugin sees internal Metabase settings plus its own without the prefix.
// On setting name collision, the plugin setting shadows the internal one.
export function toPluginSettings(
  settings: VisualizationSettings,
  prefix: string,
): PluginSettings {
  const byPrefix = pluginSettingsCache.get(settings);
  const cached = byPrefix?.get(prefix);

  if (cached) {
    return cached;
  }

  const entries = Object.entries(settings);
  const hostEntries = entries.filter(([key]) => !isCustomVizSettingKey(key));
  const pluginEntries = entries
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => [key.slice(prefix.length), value]);

  // Deep-clone so a plugin can't mutate a shared nested host object (e.g. `click_behavior`)
  // through the sandbox membrane. Settings are JSON-serializable — they persist as JSON.
  const pluginSettings: PluginSettings = clone(
    Object.fromEntries([...hostEntries, ...pluginEntries]),
  );

  const cache = byPrefix ?? new Map<string, PluginSettings>();
  cache.set(prefix, pluginSettings);
  pluginSettingsCache.set(settings, cache);

  return pluginSettings;
}

export function toHostSettings(
  settings: Record<string, unknown>,
  prefix: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [`${prefix}${key}`, value]),
  );
}
