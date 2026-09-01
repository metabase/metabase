import type { VisualizationSettingsDefinitions } from "metabase/visualizations/types";
import type { Series, VisualizationSettings } from "metabase-types/api";
import { isCustomVizDisplay } from "metabase-types/guards";

import { getCustomVizSettingKeyPrefix } from "./setting-keys";

const HOST_SETTING_KEYS_WITHOUT_DOT: ReadonlySet<string> = new Set([
  "click_behavior",
  "column",
  "column_settings",
  "series_settings",
]);

/**
 * Custom viz settings used to be stored under the plugin's bare setting ids. They now live under
 * `custom-viz:<plugin>:<id>` keys, so adopt any bare legacy key into its namespaced form on read.
 * A no-op for non custom viz displays.
 */
export function migrateStoredCustomVizSettings(
  series: Series | null | undefined,
  storedSettings: VisualizationSettings,
  getDefinitions: () => VisualizationSettingsDefinitions,
): VisualizationSettings {
  const display = series?.[0]?.card?.display;

  if (!isCustomVizDisplay(display)) {
    return storedSettings;
  }

  const prefix = getCustomVizSettingKeyPrefix(display);
  const definitions = getDefinitions();

  const legacyKeys = Object.keys(definitions)
    .filter((key) => key.startsWith(prefix))
    .map((key) => [key, key.slice(prefix.length)] as const)
    .filter(([, legacyKey]) => {
      return (
        !(legacyKey in definitions) &&
        !isHostSettingKey(legacyKey) &&
        legacyKey in storedSettings
      );
    });

  if (legacyKeys.length === 0) {
    return storedSettings;
  }

  const settings = { ...storedSettings };

  for (const [key, legacyKey] of legacyKeys) {
    if (typeof settings[key] === "undefined") {
      settings[key] = settings[legacyKey];
    }

    delete settings[legacyKey];
  }

  return settings;
}

// A plugin must not capture or erase host settings by declaring a colliding id.
// Never adopt a key that names one of Metabase's own settings (dotted keys like
// graph.goal_value`, or the exceptions listed in HOST_SETTING_KEYS_WITHOUT_DOT).
function isHostSettingKey(key: string): boolean {
  return key.includes(".") || HOST_SETTING_KEYS_WITHOUT_DOT.has(key);
}
