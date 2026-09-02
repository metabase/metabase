import { visualizations } from "metabase/visualizations/lib/registry";
import type { VisualizationSettingsDefinitions } from "metabase/visualizations/types";
import type { Series, VisualizationSettings } from "metabase-types/api";
import { isCustomVizDisplay } from "metabase-types/guards";

import { getCustomVizSettingKeyPrefix } from "./setting-keys";

// Stored keys with no registered settings definition, or whose visualization
// is only registered by some bundles (e.g. registerDashboardVisualizations).
const EXTRA_HOST_SETTING_KEYS: ReadonlySet<string> = new Set([
  "virtual_card",
  "visualization",
  "iframe",
]);

/**
 * Custom viz settings used to be stored under the plugin's bare setting ids.
 * Now they live under `custom-viz:<plugin>:<id>` keys.
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
  const hostSettingKeys = getHostSettingKeys();

  const legacyKeys = Object.keys(definitions)
    .filter((key) => key.startsWith(prefix))
    .map((key) => [key, key.slice(prefix.length)] as const)
    .filter(([, legacyKey]) => {
      return (
        Object.hasOwn(storedSettings, legacyKey) &&
        !Object.hasOwn(definitions, legacyKey) &&
        !hostSettingKeys.has(legacyKey)
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

function getHostSettingKeys(): ReadonlySet<string> {
  const keys = new Set(EXTRA_HOST_SETTING_KEYS);

  for (const [, viz] of visualizations) {
    for (const key of Object.keys(viz.settings ?? {})) {
      keys.add(key);
    }
  }

  return keys;
}
