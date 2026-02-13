import { assocIn } from "icepick";
import { t } from "ttag";

import { isVirtualDashCard } from "metabase/dashboard/utils";
import { getVisualizationRaw } from "metabase/visualizations";
import { trackCardSetToHideWhenNoResults } from "metabase/visualizations/lib/settings/analytics";
import { normalize } from "metabase-lib/v1/queries/utils/normalize";

import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import {
  getComputedSettings,
  getPersistableDefaultSettings,
  getSettingsWidgets,
} from "../settings";
import type { SettingDefinition } from "../settings";

import type { RawSeries, SingleSeries } from "metabase-types/api";
import type { VisualizationSettings } from "metabase-types/api";

const COMMON_SETTINGS: Record<string, SettingDefinition> = {
  "card.title": {
    get title() {
      return t`Title`;
    },
    widget: "input",
    getDefault: (series: RawSeries) =>
      series.length === 1 ? series[0].card.name : null,
    dashboard: true,
    useRawSeries: true,
  },
  "card.description": {
    get title() {
      return t`Description`;
    },
    widget: "input",
    getDefault: (series: RawSeries) =>
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
    getHidden: ([{ card }]: RawSeries) => isVirtualDashCard(card),
    onUpdate: (value: unknown, extra: Record<string, unknown>) => {
      if (!value) {
        return;
      }
      trackCardSetToHideWhenNoResults(extra.dashboardId as number);
    },
  },
  click_behavior: {},
};

function getSettingDefinitionsForSeries(
  series: RawSeries | null | undefined,
): Record<string, SettingDefinition> {
  if (!series) {
    return {};
  }
  const visualization = getVisualizationRaw(series);
  const definitions: Record<string, SettingDefinition> = {
    ...COMMON_SETTINGS,
    ...(visualization.settings || {}),
  };
  for (const id in definitions) {
    definitions[id].id = id;
  }
  return definitions;
}

function normalizeColumnSettings(
  columnSettings: Record<string, unknown>,
): Record<string, unknown> {
  const newColumnSettings: Record<string, unknown> = {};
  for (const oldColumnKey of Object.keys(columnSettings)) {
    const [refOrName, fieldRef] = JSON.parse(oldColumnKey) as [string, unknown];
    const newColumnKey =
      refOrName === "ref"
        ? JSON.stringify(["ref", normalize(fieldRef)])
        : oldColumnKey;
    newColumnSettings[newColumnKey] = columnSettings[oldColumnKey];
  }
  return newColumnSettings;
}

export function getStoredSettingsForSeries(
  series: RawSeries | null | undefined,
): VisualizationSettings {
  let storedSettings: VisualizationSettings =
    (series?.[0]?.card.visualization_settings as VisualizationSettings) ?? {};
  if (storedSettings.column_settings) {
    storedSettings = assocIn(
      storedSettings,
      ["column_settings"],
      normalizeColumnSettings(
        storedSettings.column_settings as Record<string, unknown>,
      ),
    ) as VisualizationSettings;
  }
  return storedSettings;
}

export function getComputedSettingsForSeries(
  series: RawSeries | null | undefined,
  extra: { enableEntityNavigation?: boolean } = {},
): ComputedVisualizationSettings {
  if (!series) {
    return {};
  }

  const settingsDefs = getSettingDefinitionsForSeries(series);
  const storedSettings = getStoredSettingsForSeries(series);
  return getComputedSettings(
    settingsDefs,
    series,
    storedSettings,
    extra,
  ) as ComputedVisualizationSettings;
}

export function getPersistableDefaultSettingsForSeries(
  series: RawSeries | null | undefined,
): Record<string, unknown> {
  const settingsDefs = getSettingDefinitionsForSeries(series);
  const computedSettings = getComputedSettingsForSeries(series);
  return getPersistableDefaultSettings(settingsDefs, computedSettings);
}

export function getSettingsWidgetsForSeries(
  series: RawSeries | null | undefined,
  onChangeSettings: (settings: VisualizationSettings, question?: unknown) => void,
  isDashboard = false,
  extra: Record<string, unknown> = {},
): import("../settings").SettingsWidget[] {
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
