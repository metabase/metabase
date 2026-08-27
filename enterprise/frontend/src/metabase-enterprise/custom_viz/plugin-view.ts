import type { CustomVisualizationProps } from "custom-viz";

import { clone } from "metabase/utils/clone";
import { toPluginSettings } from "metabase/visualizations/custom-visualizations/custom-viz-utils";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type { Series } from "metabase-types/api";

type PluginProps = CustomVisualizationProps<Record<string, unknown>>;
export type PluginSeries = PluginProps["series"];
export type PluginVizSettings = PluginProps["settings"];

const pluginSeriesCache = new WeakMap<Series, PluginSeries>();

// Sandbox proxies are writable and `card` is redux state, so the plugin gets a copy.
export function toPluginSeries(series: Series): PluginSeries {
  const cached = pluginSeriesCache.get(series);
  if (cached) {
    return cached;
  }
  const copies = series.map((single) => ({
    ...single,
    card: clone(single.card),
  }));
  // The plugin API mirrors the host's series shape with looser public types.
  const pluginSeries = copies as unknown as PluginSeries;
  pluginSeriesCache.set(series, pluginSeries);
  return pluginSeries;
}

export function toPluginVizSettings(
  settings: ComputedVisualizationSettings,
  prefix: string,
): PluginVizSettings {
  // The plugin API types the host's common settings more loosely (e.g. `column` returns plain strings).
  return toPluginSettings(settings, prefix) as unknown as PluginVizSettings;
}
