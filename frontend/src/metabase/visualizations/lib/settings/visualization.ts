import { t } from "ttag";
import { assocIn } from "icepick";
import { getVisualizationRaw } from "metabase/visualizations";
import { trackCardSetToHideWhenNoResults } from "metabase/visualizations/lib/settings/analytics";
import { isVirtualDashCard } from "metabase/dashboard/utils";
import type {
  VisualizationSettingsDefinitions,
  VisualizationSettingWidget,
} from "metabase/visualizations/types";
import type { Series, VisualizationSettings } from "metabase-types/api";
import { normalizeFieldRef } from "metabase-lib/queries/utils/dataset";
import {
  getComputedSettings,
  getSettingsWidgets,
  getPersistableDefaultSettings,
} from "../settings";

const COMMON_SETTINGS: VisualizationSettingsDefinitions<Series> = {
  "card.title": {
    title: t`Title`,
    widget: "input",
    getDefault: series =>
      (series.length === 1 ? series[0].card.name : null) ?? undefined,
    dashboard: true,
    useRawSeries: true,
  },
  "card.description": {
    title: t`Description`,
    widget: "input",
    getDefault: series =>
      (series.length === 1 ? series[0].card.description : null) ?? undefined,
    dashboard: true,
    useRawSeries: true,
  },
  "card.hide_empty": {
    title: t`Hide this card if there are no results`,
    widget: "toggle",
    inline: true,
    dashboard: true,
    getHidden: ([{ card }]) => isVirtualDashCard(card as any),
    onUpdate: (value, extra) => {
      if (!value) {
        return;
      }

      trackCardSetToHideWhenNoResults(extra.dashboardId);
    },
  },
  click_behavior: {},
};

function getSettingDefinitionsForSeries(
  series: Series,
): VisualizationSettingsDefinitions<Series> {
  if (!series) {
    return {};
  }
  const visualization = getVisualizationRaw(series);
  const definitions = {
    ...COMMON_SETTINGS,
    ...(visualization?.settings || {}),
  };
  for (const [id, def] of Object.entries(definitions)) {
    def.id = id;
  }
  return definitions;
}

function normalizeColumnSettings(
  columnSettings: VisualizationSettings["column_settings"],
) {
  const newColumnSettings: VisualizationSettings["column_settings"] = {};
  for (const oldColumnKey of Object.keys(columnSettings ?? {})) {
    const [refOrName, fieldRef] = JSON.parse(oldColumnKey);
    // if the key is a reference, normalize the mbql syntax
    const newColumnKey =
      refOrName === "ref"
        ? JSON.stringify(["ref", normalizeFieldRef(fieldRef)])
        : oldColumnKey;
    newColumnSettings[newColumnKey] = columnSettings?.[oldColumnKey] ?? {};
  }
  return newColumnSettings;
}

export function getStoredSettingsForSeries(series: Series) {
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

export function getComputedSettingsForSeries(series: Series) {
  if (!series) {
    return {};
  }
  const settingsDefs = getSettingDefinitionsForSeries(series);
  const storedSettings = getStoredSettingsForSeries(series);
  return getComputedSettings(settingsDefs as any, series, storedSettings);
}

export function getPersistableDefaultSettingsForSeries(series: Series) {
  // A complete set of settings (not only defaults) is loaded because
  // some persistable default settings need other settings as dependency for calculating the default value
  const settingsDefs = getSettingDefinitionsForSeries(series);
  const computedSettings = getComputedSettingsForSeries(series);
  return getPersistableDefaultSettings(settingsDefs as any, computedSettings);
}

export function getSettingsWidgetsForSeries(
  series: Series,
  onChangeSettings: VisualizationSettingWidget["onChangeSettings"],
  isDashboard = false,
  extra = {},
) {
  const settingsDefs = getSettingDefinitionsForSeries(series);
  const storedSettings = getStoredSettingsForSeries(series);
  const computedSettings = getComputedSettingsForSeries(series);

  return getSettingsWidgets(
    settingsDefs as any,
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
