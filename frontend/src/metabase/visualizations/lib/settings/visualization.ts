import { assocIn } from "icepick";
import { t } from "ttag";

import { isVirtualDashCard } from "metabase/dashboard/utils";
import { getVisualizationRaw } from "metabase/visualizations";
import { trackCardSetToHideWhenNoResults } from "metabase/visualizations/lib/settings/analytics";
import type {
  ComputedVisualizationSettings,
  SettingsExtra,
  VisualizationSettingsDefinitions,
} from "metabase/visualizations/types";
import { normalize } from "metabase-lib/v1/queries/utils/normalize";
import type {
  DimensionReference,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import {
  getComputedSettings,
  getPersistableDefaultSettings,
  getSettingsWidgets,
} from "../settings";

const COMMON_SETTINGS: VisualizationSettingsDefinitions<Series> = {
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
    onUpdate: (value: unknown, extra: SettingsExtra) => {
      if (!value || extra.dashboardId == null) {
        return;
      }
      trackCardSetToHideWhenNoResults(extra.dashboardId);
    },
  },
  click_behavior: {},
};

function getSettingDefinitionsForSeries(
  series: Series | null | undefined,
): VisualizationSettingsDefinitions & {
  [id: string]: { id?: string };
} {
  if (!series) {
    return {};
  }
  const visualization = getVisualizationRaw(series);
  const definitions: VisualizationSettingsDefinitions & {
    [id: string]: { id?: string };
  } = {
    ...COMMON_SETTINGS,
    ...(visualization?.settings || {}),
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
    const [refOrName, fieldRef] = JSON.parse(oldColumnKey) as [
      string,
      DimensionReference,
    ];
    // if the key is a reference, normalize the mbql syntax
    const newColumnKey =
      refOrName === "ref"
        ? JSON.stringify(["ref", normalize(fieldRef)])
        : oldColumnKey;
    newColumnSettings[newColumnKey] = columnSettings[oldColumnKey];
  }
  return newColumnSettings;
}

export function getStoredSettingsForSeries(
  series: Series | null | undefined,
): Record<string, unknown> {
  let storedSettings: Record<string, unknown> =
    (
      series?.[0]?.card as
        | { visualization_settings?: Record<string, unknown> }
        | undefined
    )?.visualization_settings ?? {};
  if (storedSettings.column_settings) {
    // normalize any settings stored under old style keys: [ref, [fk->, 1, 2]]
    storedSettings = assocIn(
      storedSettings,
      ["column_settings"],
      normalizeColumnSettings(
        storedSettings.column_settings as Record<string, unknown>,
      ),
    ) as Record<string, unknown>;
  }
  return storedSettings;
}

export function getComputedSettingsForSeries(
  series: Series | null | undefined,
  extra: SettingsExtra = {},
): ComputedVisualizationSettings {
  if (!series) {
    return {};
  }

  const settingsDefs = getSettingDefinitionsForSeries(series);
  const storedSettings = getStoredSettingsForSeries(series);
  return getComputedSettings(settingsDefs, series, storedSettings, extra);
}

export function getPersistableDefaultSettingsForSeries(
  series: Series | null | undefined,
): Record<string, unknown> {
  // A complete set of settings (not only defaults) is loaded because
  // some persistable default settings need other settings as dependency for calculating the default value
  const settingsDefs = getSettingDefinitionsForSeries(series);
  const computedSettings = getComputedSettingsForSeries(series);
  return getPersistableDefaultSettings(settingsDefs, computedSettings);
}

export function getSettingsWidgetsForSeries(
  series: Series | null | undefined,
  onChangeSettings: (newSettings: Partial<VisualizationSettings>) => void,
  isDashboard = false,
  extra: SettingsExtra = {},
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
