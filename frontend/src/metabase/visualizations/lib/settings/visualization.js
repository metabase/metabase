import { assocIn } from "icepick";
import { t } from "ttag";

import { isVirtualDashCard } from "metabase/dashboard/utils";
import { getVisualizationRaw } from "metabase/visualizations";
import { trackCardSetToHideWhenNoResults } from "metabase/visualizations/lib/settings/analytics";
import { normalize } from "metabase-lib/v1/queries/utils/normalize";

import {
  getComputedSettings,
  getPersistableDefaultSettings,
  getSettingsWidgets,
} from "../settings";

const COMMON_SETTINGS = {
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
      if (!value) {
        return;
      }

      trackCardSetToHideWhenNoResults(extra.dashboardId);
    },
  },
  click_behavior: {},
};

function getSettingDefinitionsForSeries(series) {
  if (!series) {
    return {};
  }
  const visualization = getVisualizationRaw(series);
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
        ? JSON.stringify(["ref", normalize(fieldRef)])
        : oldColumnKey;
    newColumnSettings[newColumnKey] = columnSettings[oldColumnKey];
  }
  return newColumnSettings;
}

export function getStoredSettingsForSeries(series) {
  let storedSettings =
    (series && series[0] && series[0].card.visualization_settings) || {};
  if (storedSettings.column_settings) {
    // normalize any settings stored under old style keys: [ref, [fk->, 1, 2]]
    storedSettings = assocIn(
      storedSettings,
      ["column_settings"],
      normalizeColumnSettings(storedSettings.column_settings),
    );
  }
  return storedSettings;
}

/**
 * @import { ComputedVisualizationSettings } from "metabase/visualizations/types";
 *
 * @param {any} series
 * @param {{ enableEntityNavigation?: boolean }} [extra]
 * @returns {ComputedVisualizationSettings}
 */
export function getComputedSettingsForSeries(series, extra = {}) {
  if (!series) {
    return {};
  }

  const settingsDefs = getSettingDefinitionsForSeries(series);
  const storedSettings = getStoredSettingsForSeries(series);
  return getComputedSettings(settingsDefs, series, storedSettings, extra);
}

export function getPersistableDefaultSettingsForSeries(series) {
  // A complete set of settings (not only defaults) is loaded because
  // some persistable default settings need other settings as dependency for calculating the default value
  const settingsDefs = getSettingDefinitionsForSeries(series);
  const computedSettings = getComputedSettingsForSeries(series);
  return getPersistableDefaultSettings(settingsDefs, computedSettings);
}

export function getSettingsWidgetsForSeries(
  series,
  onChangeSettings,
  isDashboard = false,
  extra = {},
) {
  const settingsDefs = getSettingDefinitionsForSeries(series);
  const storedSettings = getStoredSettingsForSeries(series);
  const computedSettings = getComputedSettingsForSeries(series);

  return getSettingsWidgets(
    settingsDefs,
    storedSettings,
    computedSettings,
    series,
    onChangeSettings,
    { isDashboard, ...extra },
  ).filter(
    (widget) =>
      widget.dashboard === undefined || widget.dashboard === isDashboard,
  );
}
