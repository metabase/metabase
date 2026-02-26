import { getIn } from "icepick";
import { t } from "ttag";

import ChartNestedSettingSeries from "metabase/visualizations/components/settings/ChartNestedSettingSeries";
import { OTHER_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type { LegacySeriesSettingsObjectKey } from "metabase/visualizations/echarts/cartesian/model/types";
import {
  SERIES_COLORS_SETTING_KEY,
  SERIES_SETTING_KEY,
  getSeriesColors,
  getSeriesDefaultDisplay,
  getSeriesDefaultLineMarker,
  getSeriesDefaultLineMissing,
  getSeriesDefaultLineSize,
  getSeriesDefaultLineStyle,
  getSeriesDefaultLinearInterpolate,
  getSeriesDefaultShowSeriesTrendline,
  getSeriesDefaultShowSeriesValues,
} from "metabase/visualizations/shared/settings/series";
import type { VisualizationSettingsDefinitions } from "metabase/visualizations/types";
import type {
  Card,
  Series,
  SingleSeries,
  VisualizationSettings,
} from "metabase-types/api";

import { getNameForCard } from "../series";

import { type NestedSettingsOptions, nestedSettings } from "./nested";

export function keyForSingleSeries(single: SingleSeries): string {
  if (isLegacySeriesCard(single.card)) {
    // _seriesKey is sometimes set by transformSeries
    return single.card._seriesKey || String(single.card.name);
  }

  return String(single.card.name);
}

function hasSingleSeriesKey(single: SingleSeries): boolean {
  if (isLegacySeriesCard(single.card)) {
    return Boolean(single.card._seriesKey || single.card.name);
  }

  return Boolean(single.card.name);
}

function isLegacySeriesCard(
  card: Card,
): card is Card & LegacySeriesSettingsObjectKey["card"] {
  return "_seriesKey" in card;
}

const LINE_DISPLAY_TYPES = new Set(["line", "area"]);

export interface SeriesSettingOptions {
  readDependencies?: string[];
  def?: Partial<NestedSettingsOptions<SingleSeries>>;
}

export function seriesSetting({
  readDependencies = [],
  def = {},
}: SeriesSettingOptions = {}): Record<string, unknown> {
  const COMMON_SETTINGS: VisualizationSettingsDefinitions<SingleSeries> = {
    // title, and color don't need widgets because they're handled directly in ChartNestedSettingSeries
    title: {
      getDefault: (single, _settings, extra = {}) => {
        const { series = [], settings: vizSettings = {} } = extra;
        const legacyTitles: string[] | undefined =
          vizSettings["graph.series_labels"];
        if (legacyTitles) {
          const index = series.indexOf(single); // TODO: pass in series index so we don't have to search for it
          if (index >= 0 && index < legacyTitles.length) {
            return legacyTitles[index];
          }
        }
        return single.card.name;
      },
    },
    display: {
      widget: "segmentedControl",
      title: t`Display type`,
      props: {
        options: [
          { value: "line", icon: "line" },
          { value: "area", icon: "area" },
          { value: "bar", icon: "bar" },
        ],
      },
      getHidden: (single, settings, _extra) =>
        !["line", "area", "bar", "combo"].includes(single.card.display ?? "") ||
        settings["stackable.stack_type"] != null,
      getDefault: (single, _settings, extra) => {
        const { series = [] } = extra ?? {};
        if (keyForSingleSeries(single) === OTHER_DATA_KEY) {
          return "bar"; // "other" series is always a bar chart now
        }
        // FIXME: will move to Cartesian series model further, but now this code is used by other legacy charts
        const transformedSeriesIndex = series.findIndex(
          (s) => keyForSingleSeries(s) === keyForSingleSeries(single),
        );
        return getSeriesDefaultDisplay(
          series[transformedSeriesIndex].card.display,
          transformedSeriesIndex,
        );
      },
    },
    color: {
      getDefault: (single, _settings, extra) => {
        // get the color for series key, computed in the setting
        return getIn(extra?.settings, [
          SERIES_COLORS_SETTING_KEY,
          keyForSingleSeries(single),
        ]);
      },
    },
    "line.interpolate": {
      title: t`Line shape`,
      widget: "segmentedControl",
      props: {
        options: [
          { icon: "straight", value: "linear" },
          { icon: "curved", value: "cardinal" },
          { icon: "stepped", value: "step-after" },
        ],
      },
      getHidden: (_single, settings) =>
        !LINE_DISPLAY_TYPES.has(settings["display"]),
      getDefault: (_single, _settings, extra) => {
        // use legacy global line.interpolate setting if present
        return getSeriesDefaultLinearInterpolate(extra?.settings ?? {});
      },
      readDependencies: ["display"],
    },
    "line.style": {
      title: t`Line style`,
      widget: "segmentedControl",
      props: {
        options: [
          { icon: "line_style_solid", value: "solid" },
          { icon: "line_style_dashed", value: "dashed" },
          { icon: "line_style_dotted", value: "dotted" },
        ],
      },
      getDefault: (_series, settings) => getSeriesDefaultLineStyle(settings),
      getHidden: (_single, settings) =>
        !LINE_DISPLAY_TYPES.has(settings["display"]),
      readDependencies: ["display"],
    },
    "line.size": {
      title: t`Line size`,
      widget: "segmentedControl",
      props: {
        options: [
          { name: "S", value: "S" },
          { name: "M", value: "M" },
          { name: "L", value: "L" },
        ],
      },
      getDefault: (_series, settings) => getSeriesDefaultLineSize(settings),
      getHidden: (_single, settings) =>
        !LINE_DISPLAY_TYPES.has(settings["display"]),
      readDependencies: ["display"],
    },
    "line.marker_enabled": {
      title: t`Show dots on lines`,
      widget: "segmentedControl",
      props: {
        options: [
          { name: t`Auto`, value: null },
          { name: t`On`, value: true },
          { name: t`Off`, value: false },
        ],
      },
      getHidden: (_single, settings) =>
        !LINE_DISPLAY_TYPES.has(settings["display"]),
      getDefault: (_single, _settings, extra) => {
        // use legacy global line.marker_enabled setting if present
        return getSeriesDefaultLineMarker(extra?.settings ?? {});
      },
      readDependencies: ["display"],
    },
    "line.missing": {
      title: t`Replace missing values with`,
      widget: "select",
      props: {
        options: [
          { name: t`Zero`, value: "zero" },
          { name: t`Nothing`, value: "none" },
          { name: t`Linear Interpolated`, value: "interpolate" },
        ],
      },
      getHidden: (_single, settings) =>
        !LINE_DISPLAY_TYPES.has(settings["display"]),
      getDefault: (_single: SingleSeries, _settings, extra) => {
        // use legacy global line.missing setting if present
        return getSeriesDefaultLineMissing(extra?.settings ?? {});
      },
      readDependencies: ["display"],
    },
    axis: {
      title: t`Y-axis position`,
      widget: "segmentedControl",
      default: null,
      getHidden: (single: SingleSeries) => single.card.display === "row",
      props: {
        options: [
          { name: t`Auto`, value: null },
          { name: t`Left`, value: "left" },
          { name: t`Right`, value: "right" },
        ],
      },
      readDependencies: ["display"],
    },
    show_series_trendline: {
      title: t`Show trend line for this series`,
      widget: "toggle",
      inline: true,
      getHidden: (_single, _seriesSettings, extra) => {
        const { series = [], settings = {} } = extra ?? {};
        return (
          series.length <= 1 || // no need to show series-level control if there's only one series
          !settings["graph.show_trendline"] // don't show it unless this chart has a global setting;
        );
      },
      getDefault: (_single, _seriesSettings, extra) =>
        getSeriesDefaultShowSeriesTrendline(extra?.settings ?? {}),
      readDependencies: ["graph.show_trendline"],
    },
    show_series_values: {
      title: t`Show values for this series`,
      widget: "toggle",
      inline: true,
      getHidden: (_single, _seriesSettings, extra) => {
        const { series = [], settings = {} } = extra ?? {};

        return Boolean(
          series.length <= 1 || // no need to show series-level control if there's only one series
            !settings["graph.show_values"] || // don't show it unless this chart has a global setting
            (settings["stackable.stack_type"] &&
              settings["graph.show_stack_values"] === "total"),
        );
      },
      getDefault: (_single, _seriesSettings, extra) =>
        getSeriesDefaultShowSeriesValues(extra?.settings ?? {}),
      readDependencies: ["graph.show_values", "stackable.stack_type"],
    },
  };

  return {
    ...nestedSettings(SERIES_SETTING_KEY, {
      getHidden: ([{ card }], _settings, extra) =>
        !extra?.isDashboard || card?.display === "waterfall",
      getSection: (_series, _settings, extra) =>
        extra?.isDashboard ? t`Display` : t`Style`,
      objectName: "series",
      getObjects: (series) => series,
      getObjectKey: keyForSingleSeries,
      getObjectSettings: (storedSettings, object) =>
        storedSettings[keyForSingleSeries(object)],
      getSettingDefinitionsForObject: () => COMMON_SETTINGS,
      component: ChartNestedSettingSeries,
      readDependencies: [SERIES_COLORS_SETTING_KEY, ...readDependencies],
      noPadding: true,
      getExtraProps: (series) => ({
        seriesCardNames: series.reduce<Record<string, string>>(
          (memo, singleSeries) => {
            memo[keyForSingleSeries(singleSeries)] = getNameForCard(
              singleSeries.card,
            );
            return memo;
          },
          {},
        ),
      }),
      ...def,
    }),
    // colors must be computed as a whole rather than individually
    [SERIES_COLORS_SETTING_KEY]: {
      getValue: getColors,
    },
  };
}

/**
 * Exported for testing purposes.
 * Computes the colors for the series based on their keys and settings.
 * It filters out series that do not have a single key and maps them to their keys.
 * Then it retrieves the colors using the `getSeriesColors` function.
 * @param series - The series to compute colors for.
 * @param settings - The visualization settings.
 * @returns {Object} - An object mapping series keys to their colors.
 */
export function getColors(
  series: Series,
  settings: VisualizationSettings,
): Record<string, string> {
  const keys: string[] = [];
  const defaultKeys: (string | undefined)[] = [];

  for (const s of series.filter(hasSingleSeriesKey)) {
    const key = keyForSingleSeries(s);
    const mappedValue = s.columnValuesMapping?.[key]?.[0];

    keys.push(key);
    defaultKeys.push(
      typeof mappedValue === "string" ? mappedValue : mappedValue?.originalName,
    );
  }

  return getSeriesColors(keys, settings, defaultKeys);
}
