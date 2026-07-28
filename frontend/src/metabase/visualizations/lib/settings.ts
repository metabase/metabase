import _ from "underscore";

import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import {
  convertLinkColumnToClickBehavior,
  removeInternalClickBehaviors,
} from "metabase/embedding-sdk/lib/links";
import type {
  ComputedVisualizationSettings,
  SettingsExtra,
  VisualizationSettingDefinition,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import type {
  ColumnSettings,
  Series,
  VisualizationSettingKey,
  VisualizationSettings,
} from "metabase-types/api";
import { isObjectWithRaw } from "metabase-types/guards";

export function getComputedSettings<T>(
  settingsDefs: VisualizationSettingsDefinitions,
  object: T,
  storedSettings: VisualizationSettings,
  extra: SettingsExtra = {},
): ComputedVisualizationSettings {
  const computedSettings: ComputedVisualizationSettings = {};

  for (const settingId in settingsDefs) {
    getComputedSetting(
      computedSettings,
      settingsDefs,
      settingId,
      object,
      storedSettings,
      extra,
    );
  }

  if (isEmbeddingSdk()) {
    const shouldKeepInternalClickBehavior = extra.enableEntityNavigation;

    const result: ComputedVisualizationSettings = _.compose(
      // remove internal click behaviors unless internal navigation is enabled
      shouldKeepInternalClickBehavior
        ? _.identity
        : removeInternalClickBehaviors,
      convertLinkColumnToClickBehavior,
    )(computedSettings);

    return result;
  }

  return computedSettings;
}

function getComputedSetting<T, TValue, TProps extends Record<string, unknown>>(
  computedSettings: ComputedVisualizationSettings, // MUTATED!
  settingDefs: VisualizationSettingsDefinitions,
  settingId: VisualizationSettingKey,
  object: T,
  storedSettings: VisualizationSettings,
  extra: SettingsExtra = {},
): void {
  if (settingId in computedSettings) {
    return;
  }

  const settingDef: VisualizationSettingDefinition<T, TValue, TProps> =
    settingDefs[settingId] ?? {};

  for (const dependentId of settingDef.readDependencies || []) {
    getComputedSetting(
      computedSettings,
      settingDefs,
      dependentId,
      object,
      storedSettings,
      extra,
    );
  }

  const resolvedObject =
    settingDef.useRawSeries && isObjectWithRaw(object) && object._raw
      ? object._raw
      : object;

  const settings: ComputedVisualizationSettings = {
    ...storedSettings,
    ...computedSettings,
  };

  try {
    if (settingDef.getValue) {
      computedSettings[settingId] = settingDef.getValue(
        resolvedObject,
        settings,
        extra,
      );
      return;
    }

    if (storedSettings[settingId] !== undefined) {
      const isValid = settingDef.isValid;
      if (!isValid || isValid(resolvedObject, settings, extra)) {
        computedSettings[settingId] = storedSettings[settingId];
        return;
      }
    }

    if (settingDef.getDefault) {
      const defaultValue = settingDef.getDefault(
        resolvedObject,
        settings,
        extra,
      );
      computedSettings[settingId] = defaultValue;
      return;
    }
  } catch (e) {
    console.warn("Error getting setting", settingId, e);
  }
  computedSettings[settingId] = undefined;
}

export function getPersistableDefaultSettings(
  settingsDefs: VisualizationSettingsDefinitions,
  completeSettings: ComputedVisualizationSettings,
): ComputedVisualizationSettings {
  const persistableDefaultSettings: ComputedVisualizationSettings = {};

  for (const settingId in settingsDefs) {
    const settingDef: VisualizationSettingDefinition<Series> =
      settingsDefs[settingId];

    if (settingDef.persistDefault) {
      persistableDefaultSettings[settingId] = completeSettings[settingId];
    }
  }
  return persistableDefaultSettings;
}

export function updateSettings(
  storedSettings: VisualizationSettings,
  changedSettings: Partial<VisualizationSettings>,
): VisualizationSettings {
  const newSettings = {
    ...storedSettings,
    ...changedSettings,
  };

  // remove undefined settings
  for (const [key, value] of Object.entries(changedSettings)) {
    if (value === undefined) {
      delete newSettings[key];
    }
  }

  return newSettings;
}

export function getClickBehaviorSettings(
  settings: VisualizationSettings | null | undefined,
): VisualizationSettings {
  const newSettings: VisualizationSettings = {};

  if (!settings) {
    return newSettings;
  }

  if (settings.click_behavior) {
    newSettings.click_behavior = settings.click_behavior;
  }

  const columnSettings = getColumnClickBehavior(settings.column_settings);

  if (columnSettings) {
    newSettings.column_settings = columnSettings;
  }

  return newSettings;
}

function getColumnClickBehavior(
  columnSettings: Record<string, ColumnSettings> | undefined,
): Record<string, ColumnSettings> | null {
  if (columnSettings == null) {
    return null;
  }

  const entries = Object.entries(columnSettings).filter(
    ([, fieldSettings]) => fieldSettings.click_behavior != null,
  );

  if (entries.length === 0) {
    return null;
  }

  return entries.reduce(
    (acc, [key, fieldSettings]) => ({
      ...acc,
      [key]: {
        click_behavior: fieldSettings.click_behavior,
      },
    }),
    {},
  );
}

const KEYS_TO_COMPARE = new Set([
  "number_style",
  "currency",
  "currency_style",
  "number_separators",
  "decimals",
  "scale",
  "prefix",
  "suffix",
]);

export function getLineAreaBarComparisonSettings(
  columnSettings: ColumnSettings,
): Partial<ColumnSettings> {
  return _.pick(columnSettings, (value, key) => {
    if (!KEYS_TO_COMPARE.has(key)) {
      return false;
    }
    if ((key === "prefix" || key === "suffix") && value === "") {
      return false;
    }
    return true;
  });
}
