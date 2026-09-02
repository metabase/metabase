import type { CustomVisualizationProps } from "custom-viz";

import { isCustomVizSettingKey } from "metabase/visualizations/custom-visualizations/setting-keys";
import type { Series, VisualizationSettings } from "metabase-types/api";

type PluginProps = CustomVisualizationProps<Record<string, unknown>>;

export type PluginSeries = PluginProps["series"];

export type PluginSettings = PluginProps["settings"];

// Keyed by a host object, then by the plugin's prefix: every plugin gets its
// own copy, so one plugin's mutations can't reach another's.
class PerPluginCache<K extends object, V> {
  private readonly byKey = new WeakMap<K, Map<string, V>>();

  get(key: K, prefix: string): V | undefined {
    return this.byKey.get(key)?.get(prefix);
  }

  set(key: K, prefix: string, value: V): void {
    const byPrefix = this.byKey.get(key) ?? new Map<string, V>();
    byPrefix.set(prefix, value);
    this.byKey.set(key, byPrefix);
  }
}

const pluginSeriesCache = new PerPluginCache<Series, PluginSeries>();
const pluginDataCache = new PerPluginCache<
  Series[number]["data"],
  PluginSeries[number]["data"]
>();
const pluginSettingsCache = new PerPluginCache<
  VisualizationSettings,
  PluginSettings
>();

export function toPluginSeries(series: Series, prefix: string): PluginSeries {
  const cached = pluginSeriesCache.get(series, prefix);

  if (cached) {
    return cached;
  }

  const pluginSeries = series.map(({ data, error }) => ({
    data: toPluginData(data, prefix),
    error: structuredClone(error),
  }));
  pluginSeriesCache.set(series, prefix, pluginSeries);

  return pluginSeries;
}

// Sensibility probes rebuild the series array per display, so the expensive
// dataset clone is keyed on the stable data object - one clone per plugin and
// query result.
function toPluginData(
  data: Series[number]["data"],
  prefix: string,
): PluginSeries[number]["data"] {
  const cached = pluginDataCache.get(data, prefix);

  if (cached) {
    return cached;
  }

  const cloned = structuredClone(data);
  pluginDataCache.set(data, prefix, cloned);

  return cloned;
}

// The plugin sees internal Metabase settings plus its own without the prefix.
// On setting name collision, the plugin setting shadows the internal one.
export function toPluginSettings(
  settings: VisualizationSettings,
  prefix: string,
): PluginSettings {
  const cached = pluginSettingsCache.get(settings, prefix);

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

  pluginSettingsCache.set(settings, prefix, pluginSettings);

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
