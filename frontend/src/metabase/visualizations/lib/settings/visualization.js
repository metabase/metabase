import { t } from "ttag";

import { isVirtualDashCard } from "metabase/dashboard/utils";
import { getVisualizationRaw } from "metabase/visualizations";
import { trackCardSetToHideWhenNoResults } from "metabase/visualizations/lib/settings/analytics";

import {
  getComputedSettings,
  getSettingsWidgets,
  getPersistableDefaultSettings,
} from "../settings";

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
  "card.hide_empty": {
    title: t`Hide this card if there are no results`,
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

function getSettingDefintionsForSeries(series) {
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

export function getStoredSettingsForSeries(series) {
  const storedSettings =
    (series && series[0] && series[0].card.visualization_settings) || {};
  return storedSettings;
}

export function getComputedSettingsForSeries(series) {
  if (!series) {
    return {};
  }
  const settingsDefs = getSettingDefintionsForSeries(series);
  const storedSettings = getStoredSettingsForSeries(series);
  return getComputedSettings(settingsDefs, series, storedSettings);
}

export function getPersistableDefaultSettingsForSeries(series) {
  // A complete set of settings (not only defaults) is loaded because
  // some persistable default settings need other settings as dependency for calculating the default value
  const settingsDefs = getSettingDefintionsForSeries(series);
  const computedSettings = getComputedSettingsForSeries(series);
  return getPersistableDefaultSettings(settingsDefs, computedSettings);
}

export function getSettingsWidgetsForSeries(
  series,
  onChangeSettings,
  isDashboard = false,
  extra = {},
) {
  const settingsDefs = getSettingDefintionsForSeries(series);
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
    widget =>
      widget.dashboard === undefined || widget.dashboard === isDashboard,
  );
}
