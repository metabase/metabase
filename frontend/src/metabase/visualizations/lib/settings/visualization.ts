import { assocIn } from "icepick";
import { t } from "ttag";

import { isVirtualDashCard } from "metabase/utils/dashboard";
import { migrateStoredCustomVizSettings } from "metabase/visualizations/custom-visualizations/migrate-legacy-settings";
import { trackCardSetToHideWhenNoResults } from "metabase/visualizations/lib/settings/analytics";
import type {
  ComputedVisualizationSettings,
  SettingsExtra,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import type {
  ColumnSettings,
  DimensionReference,
  Series,
  VisualizationDisplay,
  VisualizationSettings,
} from "metabase-types/api";

import { getVisualization } from "../registry";
import {
  getComputedSettings,
  getPersistableDefaultSettings,
} from "../settings";

const COMMON_SETTINGS: VisualizationSettingsDefinitions = {
  "card.title": {
    get title() {
      return t`Title`;
    },
    widget: "input",
    getDefault: (series) => (series.length === 1 ? series[0].card.name : null),
    dashboard: true,
    useRawSeries: true,
  },
  "card.description": {
    get title() {
      return t`Description`;
    },
    widget: "input",
    getDefault: (series) =>
      series.length === 1 ? series[0].card.description : null,
    dashboard: true,
    useRawSeries: true,
  },
  "card.hide_empty": {
    get title() {
      return t`Hide this card if there are no results`;
    },
    widget: "toggle",
    inline: true,
    dashboard: true,
    getHidden: ([{ card }]) => isVirtualDashCard(card),
    onUpdate: (value, extra) => {
      if (!value || extra.dashboardId == null) {
        return;
      }
      trackCardSetToHideWhenNoResults(extra.dashboardId);
    },
  },
  click_behavior: {},
};

export function getSettingDefinitionsForDisplay(
  display: VisualizationDisplay | undefined,
): VisualizationSettingsDefinitions {
  const visualization = getVisualization(display ?? null);
  const definitions = {
    ...COMMON_SETTINGS,
    ...visualization?.settings,
  };
  for (const id in definitions) {
    definitions[id].id = id;
  }
  return definitions;
}

export function getSettingDefinitionsForSeries(
  series: Series | null | undefined,
): VisualizationSettingsDefinitions {
  if (!series) {
    return {};
  }
  return getSettingDefinitionsForDisplay(series[0]?.card?.display);
}

function normalizeColumnSettings(
  columnSettings: Record<string, ColumnSettings>,
): Record<string, ColumnSettings> {
  const newColumnSettings: Record<string, ColumnSettings> = {};
  for (const oldColumnKey of Object.keys(columnSettings)) {
    const [refOrName, fieldRef]: [string, DimensionReference] =
      JSON.parse(oldColumnKey);
    // keys are re-serialized so legacy formatting differences don't matter
    const newColumnKey =
      refOrName === "ref" ? JSON.stringify(["ref", fieldRef]) : oldColumnKey;
    newColumnSettings[newColumnKey] = columnSettings[oldColumnKey];
  }
  return newColumnSettings;
}

export function getStoredSettingsForSeries(
  series: Series | null | undefined,
  definitions?: VisualizationSettingsDefinitions,
): VisualizationSettings {
  let storedSettings = series?.[0]?.card?.visualization_settings ?? {};

  if (storedSettings.column_settings) {
    // normalize any settings stored under old style keys: [ref, [fk->, 1, 2]]
    storedSettings = assocIn(
      storedSettings,
      ["column_settings"],
      normalizeColumnSettings(storedSettings.column_settings),
    );
  }

  return migrateStoredCustomVizSettings(
    series?.[0]?.card?.display,
    storedSettings,
    () => definitions ?? getSettingDefinitionsForSeries(series),
  );
}

export function getComputedSettingsForSeries(
  series: Series | null | undefined,
  extra: SettingsExtra = {},
): ComputedVisualizationSettings {
  if (!series) {
    return {};
  }

  const settingsDefs = getSettingDefinitionsForSeries(series);
  const storedSettings = getStoredSettingsForSeries(series, settingsDefs);
  return getComputedSettings(settingsDefs, series, storedSettings, extra);
}

export function getPersistableDefaultSettingsForSeries(
  series: Series | null | undefined,
): ComputedVisualizationSettings {
  // A complete set of settings (not only defaults) is loaded because
  // some persistable default settings need other settings as dependency for calculating the default value
  const settingsDefs = getSettingDefinitionsForSeries(series);
  const computedSettings = getComputedSettingsForSeries(series);
  return getPersistableDefaultSettings(settingsDefs, computedSettings);
}
