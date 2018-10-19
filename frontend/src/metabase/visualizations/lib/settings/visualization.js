/* @flow */

import {
  getComputedSettings,
  getSettingsWidgets,
  getPersistableDefaultSettings,
} from "../settings";

import { getVisualizationRaw } from "metabase/visualizations";
import { t } from "c-3po";

import type { Settings, SettingDefs, WidgetDef } from "../settings";
import type { Series } from "metabase/meta/types/Visualization";

const COMMON_SETTINGS = {
  "card.title": {
    title: t`Title`,
    widget: "input",
    getDefault: series => (series.length === 1 ? series[0].card.name : null),
    dashboard: true,
    useRawSeries: true,
  },
  "card.description": {
    title: t`Description`,
    widget: "input",
    getDefault: series =>
      series.length === 1 ? series[0].card.description : null,
    dashboard: true,
    useRawSeries: true,
  },
};

function getSettingDefintionsForSeries(series: ?Series): SettingDefs {
  if (!series) {
    return {};
  }
  const { CardVisualization } = getVisualizationRaw(series);
  const definitions = {
    ...COMMON_SETTINGS,
    ...(CardVisualization.settings || {}),
  };
  for (const id in definitions) {
    definitions[id].id = id;
  }
  return definitions;
}

export function getStoredSettingsForSeries(series: ?Series): Settings {
  return (series && series[0] && series[0].card.visualization_settings) || {};
}

export function getComputedSettingsForSeries(series: ?Series): Settings {
  if (!series) {
    return {};
  }
  const settingsDefs = getSettingDefintionsForSeries(series);
  const storedSettings = getStoredSettingsForSeries(series);
  return getComputedSettings(settingsDefs, series, storedSettings);
}

export function getPersistableDefaultSettingsForSeries(
  series: ?Series,
): Settings {
  // A complete set of settings (not only defaults) is loaded because
  // some persistable default settings need other settings as dependency for calculating the default value
  const settingsDefs = getSettingDefintionsForSeries(series);
  const computedSettings = getComputedSettingsForSeries(series);
  return getPersistableDefaultSettings(settingsDefs, computedSettings);
}

export function getSettingsWidgetsForSeries(
  series: ?Series,
  onChangeSettings: (settings: Settings) => void,
  isDashboard: boolean = false,
): WidgetDef[] {
  const settingsDefs = getSettingDefintionsForSeries(series);
  const storedSettings = getStoredSettingsForSeries(series);
  const computedSettings = getComputedSettingsForSeries(series);
  return getSettingsWidgets(
    settingsDefs,
    storedSettings,
    computedSettings,
    series,
    onChangeSettings,
  ).filter(
    widget =>
      widget.dashboard === undefined || widget.dashboard === isDashboard,
  );
}
