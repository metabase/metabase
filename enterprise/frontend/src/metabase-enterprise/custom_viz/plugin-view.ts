import type { CustomVisualizationProps } from "custom-viz";

import { isCustomVizSettingKey } from "metabase/visualizations/custom-visualizations/setting-keys";
import type { Series, VisualizationSettings } from "metabase-types/api";

type PluginProps = CustomVisualizationProps<Record<string, unknown>>;

export type PluginSeries = PluginProps["series"];

export type PluginSettings = PluginProps["settings"];

const pluginSeriesCache = new WeakMap<Series, PluginSeries>();
const pluginDataCache = new WeakMap<
  Series[number]["data"],
  PluginSeries[number]["data"]
>();
const pluginSettingsCache = new WeakMap<
  VisualizationSettings,
  Map<string, PluginSettings>
>();

export function toPluginSeries(series: Series): PluginSeries {
  const cached = pluginSeriesCache.get(series);

  if (cached) {
    return cached;
  }

  const pluginSeries = series.map(({ data, error }) => ({
    data: toPluginData(data),
    error: structuredClone(error),
  }));
  pluginSeriesCache.set(series, pluginSeries);

  return pluginSeries;
}

// Sensibility probes rebuild the series array per display, so the expensive
// dataset clone is keyed on the stable data object - one clone per query result.
function toPluginData(
  data: Series[number]["data"],
): PluginSeries[number]["data"] {
  const cached = pluginDataCache.get(data);

  if (cached) {
    return cached;
  }

  const cloned = structuredClone(data);
  pluginDataCache.set(data, cloned);

  return cloned;
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

  const merged = Object.fromEntries([...hostEntries, ...pluginEntries]);

  // Deep-clone so a plugin can't mutate a shared nested host object (e.g. `click_behavior`)
  // through the sandbox membrane.
  const pluginSettings: PluginSettings = cloneCloneableEntries(merged);

  if (typeof merged.column === "function") {
    pluginSettings.column = (column) => {
      // Fresh copy per call so mutating the result can't reach the host's memoized settings.
      const { column: _embeddedColumn, ...columnSettings } =
        merged.column(column);
      return {
        ...cloneCloneableEntries(columnSettings),
        column,
      };
    };
  }

  const cache = byPrefix ?? new Map<string, PluginSettings>();
  cache.set(prefix, pluginSettings);
  pluginSettingsCache.set(settings, cache);

  return pluginSettings;
}

// Drops entries values of which structuredClone rejects.
function cloneCloneableEntries(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const cloned: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    try {
      cloned[key] = structuredClone(entry);
    } catch {
      // dropped
    }
  }

  return cloned;
}

export function toHostSettings(
  settings: Record<string, unknown>,
  prefix: string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(settings).map(([key, value]) => [`${prefix}${key}`, value]),
  );
}
