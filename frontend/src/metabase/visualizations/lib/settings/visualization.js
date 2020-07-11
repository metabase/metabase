/* @flow */

import {
  getComputedSettings,
  getSettingsWidgets,
  getPersistableDefaultSettings,
} from "../settings";

import { getVisualizationRaw } from "metabase/visualizations";
import { normalizeFieldRef } from "metabase/lib/dataset";
import { t } from "ttag";

import type { Settings, SettingDefs, WidgetDef } from "../settings";
import type { Series } from "metabase-types/types/Visualization";
import type { VisualizationSettings } from "metabase-types/types/Card";

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
  const { visualization } = getVisualizationRaw(series);
  const definitions = {
    ...COMMON_SETTINGS,
    ...(visualization.settings || {}),
  };
  for (const id in definitions) {
    definitions[id].id = id;
  }
  return definitions;
}

function normalizeColumnSettings(columnSettings) {
  const newColumnSettings = {};
  for (const oldColumnKey of Object.keys(columnSettings)) {
    const [refOrName, fieldRef] = JSON.parse(oldColumnKey);
    // if the key is a reference, normalize the mbql syntax
    const newColumnKey =
      refOrName === "ref"
        ? JSON.stringify(["ref", normalizeFieldRef(fieldRef)])
        : oldColumnKey;
    newColumnSettings[newColumnKey] = columnSettings[oldColumnKey];
  }
  return newColumnSettings;
}

export function getStoredSettingsForSeries(series: ?Series): Settings {
  const storedSettings: VisualizationSettings =
    (series && series[0] && series[0].card.visualization_settings) || {};
  if (storedSettings.column_settings) {
    // normalize any settings stored under old style keys: [ref, [fk->, 1, 2]]
    storedSettings.column_settings = normalizeColumnSettings(
      storedSettings.column_settings,
    );
  }
  return storedSettings;
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
