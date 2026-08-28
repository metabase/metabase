import type { CustomVisualizationProps } from "custom-viz";

import { clone } from "metabase/utils/clone";
import { isCustomVizSettingKey } from "metabase/visualizations/custom-visualizations/setting-keys";
import type { Series, VisualizationSettings } from "metabase-types/api";

type PluginProps = CustomVisualizationProps<Record<string, unknown>>;
export type PluginSeries = PluginProps["series"];
export type PluginSettings = PluginProps["settings"];

const pluginSeriesCache = new WeakMap<Series, PluginSeries>();
const pluginSettingsCache = new WeakMap<
  VisualizationSettings,
  { prefix: string; pluginSettings: PluginSettings }
>();

// Sandbox proxies write through to redux state, so the plugin gets a copy.
export function toPluginSeries(series: Series): PluginSeries {
  const cached = pluginSeriesCache.get(series);
  if (cached) {
    return cached;
  }
  // The plugin API mirrors the host's series shape with looser public types.
  const pluginSeries = series.map((single) =>
    clone(single),
  ) as unknown as PluginSeries;
  pluginSeriesCache.set(series, pluginSeries);
  return pluginSeries;
}

// The plugin sees host settings plus its own without the prefix; a same-named plugin setting shadows the host one.
export function toPluginSettings(
  settings: VisualizationSettings,
  prefix: string,
): PluginSettings {
  const cached = pluginSettingsCache.get(settings);
  if (cached?.prefix === prefix) {
    return cached.pluginSettings;
  }
  const entries = Object.entries(settings);
  const hostEntries = entries.filter(([key]) => !isCustomVizSettingKey(key));
  const pluginEntries = entries
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, value]) => [key.slice(prefix.length), value]);
  // The plugin API types the host's common settings more loosely (e.g. `column` returns plain strings).
  const pluginSettings = Object.fromEntries([
    ...hostEntries,
    ...pluginEntries,
  ]) as unknown as PluginSettings;
  pluginSettingsCache.set(settings, { prefix, pluginSettings });
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
