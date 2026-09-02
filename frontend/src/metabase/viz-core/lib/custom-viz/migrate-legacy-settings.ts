import type {
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";
import { isCustomVizDisplay } from "metabase-types/guards";

import type { VisualizationSettingsDefinitions } from "../../types";
import { visualizations } from "../registry";

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
  display: VisualizationDisplay | undefined,
  storedSettings: VisualizationSettings,
  getDefinitions: () => VisualizationSettingsDefinitions,
): VisualizationSettings {
  if (!isCustomVizDisplay(display)) {
    return storedSettings;
  }

  const definitions = getDefinitions();

  return adoptLegacyKeys(storedSettings, {
    prefix: getCustomVizSettingKeyPrefix(display),
    namespacedKeys: Object.keys(definitions),
    isHostKey: getIsHostKey(definitions),
  });
}

/**
 * A dashcard override saved under a bare id has to keep overriding the card's
 * namespaced value once the two are merged, so it is namespaced first.
 */
export function migrateStoredDashcardCustomVizSettings(
  display: VisualizationDisplay | undefined,
  cardSettings: VisualizationSettings,
  dashcardSettings: VisualizationSettings,
  getDefinitions: () => VisualizationSettingsDefinitions,
): VisualizationSettings {
  if (!isCustomVizDisplay(display)) {
    return dashcardSettings;
  }

  return adoptLegacyKeys(dashcardSettings, {
    prefix: getCustomVizSettingKeyPrefix(display),
    namespacedKeys: Object.keys(cardSettings),
    isHostKey: getIsHostKey(getDefinitions()),
  });
}

function adoptLegacyKeys(
  storedSettings: VisualizationSettings,
  {
    prefix,
    namespacedKeys,
    isHostKey,
  }: {
    prefix: string;
    namespacedKeys: string[];
    isHostKey: (key: string) => boolean;
  },
): VisualizationSettings {
  const legacyKeys = namespacedKeys
    .filter((key) => key.startsWith(prefix))
    .map((key) => [key, key.slice(prefix.length)] as const)
    .filter(
      ([, legacyKey]) =>
        Object.hasOwn(storedSettings, legacyKey) && !isHostKey(legacyKey),
    );

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

function getIsHostKey(definitions: VisualizationSettingsDefinitions) {
  const hostSettingKeys = getHostSettingKeys();

  return (key: string) =>
    Object.hasOwn(definitions, key) || hostSettingKeys.has(key);
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
