import { getIn } from "icepick";
import { t } from "ttag";

import ChartNestedSettingSeries from "metabase/visualizations/components/settings/ChartNestedSettingSeries";
import { OTHER_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
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
  getSeriesDefaultShowSeriesValues,
} from "metabase/visualizations/shared/settings/series";

import { getNameForCard } from "../series";

import { nestedSettings } from "./nested";

import type { SingleSeries } from "metabase-types/api";
import type { VisualizationSettings } from "metabase-types/api";

export function keyForSingleSeries(single: SingleSeries): string {
  const card = single.card as { _seriesKey?: string; name?: string };
  return card._seriesKey ?? String(card.name);
}

function hasSingleSeriesKey(single: SingleSeries): boolean {
  const card = single.card as { _seriesKey?: string; name?: string };
  return Boolean(card._seriesKey ?? card.name);
}

const LINE_DISPLAY_TYPES = new Set(["line", "area"]);

interface SeriesSettingOptions {
  readDependencies?: string[];
  def?: Record<string, unknown>;
}

export function seriesSetting({
  readDependencies = [],
  def = {},
}: SeriesSettingOptions = {}): Record<string, unknown> {
  const COMMON_SETTINGS: Record<string, unknown> = {
    title: {
      getDefault: (
        single: SingleSeries,
        _settings: Record<string, unknown>,
        { series, settings: vizSettings }: { series: SingleSeries[]; settings: VisualizationSettings },
      ) => {
        const legacyTitles = vizSettings["graph.series_labels"] as string[] | undefined;
        if (legacyTitles) {
          const index = series.indexOf(single);
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
      getHidden: (
        single: SingleSeries,
        settings: Record<string, unknown>,
        { series }: { series: SingleSeries[] },
      ) =>
        !["line", "area", "bar", "combo"].includes(single.card.display as string) ||
        settings["stackable.stack_type"] != null,
      getDefault: (single: SingleSeries, settings: Record<string, unknown>, { series }: { series: SingleSeries[] }) => {
        if (keyForSingleSeries(single) === OTHER_DATA_KEY) {
          return "bar";
        }
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
      getDefault: (
        single: SingleSeries,
        _settings: Record<string, unknown>,
        { settings: vizSettings }: { settings: VisualizationSettings },
      ) =>
        getIn(vizSettings, [
          SERIES_COLORS_SETTING_KEY,
          keyForSingleSeries(single),
        ]),
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
      getHidden: (single: SingleSeries, settings: Record<string, unknown>) =>
        !LINE_DISPLAY_TYPES.has(settings["display"] as string),
      getDefault: (_single: SingleSeries, _settings: Record<string, unknown>, { settings: vizSettings }: { settings: VisualizationSettings }) =>
        getSeriesDefaultLinearInterpolate(vizSettings),
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
      getDefault: (_series: SingleSeries, settings: Record<string, unknown>) =>
        getSeriesDefaultLineStyle(settings),
      getHidden: (single: SingleSeries, settings: Record<string, unknown>) =>
        !LINE_DISPLAY_TYPES.has(settings["display"] as string),
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
      getDefault: (_series: SingleSeries, settings: Record<string, unknown>) =>
        getSeriesDefaultLineSize(settings),
      getHidden: (single: SingleSeries, settings: Record<string, unknown>) =>
        !LINE_DISPLAY_TYPES.has(settings["display"] as string),
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
      getHidden: (single: SingleSeries, settings: Record<string, unknown>) =>
        !LINE_DISPLAY_TYPES.has(settings["display"] as string),
      getDefault: (_single: SingleSeries, _settings: Record<string, unknown>, { settings: vizSettings }: { settings: VisualizationSettings }) =>
        getSeriesDefaultLineMarker(vizSettings),
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
      getHidden: (single: SingleSeries, settings: Record<string, unknown>) =>
        !LINE_DISPLAY_TYPES.has(settings["display"] as string),
      getDefault: (_single: SingleSeries, _settings: Record<string, unknown>, { settings: vizSettings }: { settings: VisualizationSettings }) =>
        getSeriesDefaultLineMissing(vizSettings),
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
    show_series_values: {
      title: t`Show values for this series`,
      widget: "toggle",
      inline: true,
      getHidden: (
        single: SingleSeries,
        seriesSettings: Record<string, unknown>,
        { settings, series }: { settings: VisualizationSettings; series: SingleSeries[] },
      ) =>
        series.length <= 1 ||
        !settings["graph.show_values"] ||
        (settings["stackable.stack_type"] &&
          settings["graph.show_stack_values"] === "total"),
      getDefault: (
        _single: SingleSeries,
        _seriesSettings: Record<string, unknown>,
        { settings }: { settings: VisualizationSettings },
      ) => getSeriesDefaultShowSeriesValues(settings),
      readDependencies: ["graph.show_values", "stackable.stack_type"],
    },
  };

  function getSettingDefinitionsForSingleSeries(
    series: SingleSeries[],
    _object: SingleSeries,
    _settings: Record<string, unknown>,
  ): Record<string, unknown> {
    return COMMON_SETTINGS;
  }

  return {
    ...nestedSettings(SERIES_SETTING_KEY, {
      getHidden: ([{ card }]: SingleSeries[], settings: Record<string, unknown>, { isDashboard }: { isDashboard?: boolean }) =>
        !isDashboard || card?.display === "waterfall",
      getSection: (
        _series: SingleSeries[],
        _settings: Record<string, unknown>,
        { isDashboard }: { isDashboard?: boolean },
      ) => (isDashboard ? t`Display` : t`Style`),
      objectName: "series",
      getObjects: (series: SingleSeries[]) => series,
      getObjectKey: keyForSingleSeries,
      getObjectSettings: (settings: Record<string, unknown>, object: SingleSeries) =>
        settings[keyForSingleSeries(object)] as Record<string, unknown>,
      getSettingDefinitionsForObject: getSettingDefinitionsForSingleSeries,
      component: ChartNestedSettingSeries,
      readDependencies: [SERIES_COLORS_SETTING_KEY, ...readDependencies],
      noPadding: true,
      getExtraProps: (series: SingleSeries[]) => ({
        seriesCardNames: series.reduce(
          (memo: Record<string, string>, singleSeries: SingleSeries) => {
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
    [SERIES_COLORS_SETTING_KEY]: {
      getValue: getColors,
    },
  };
}

/**
 * Exported for testing purposes.
 */
export function getColors(
  series: SingleSeries[],
  settings: VisualizationSettings,
): Record<string, string> {
  const originalKeys: (string | undefined)[] = [];

  const keys = series.filter(hasSingleSeriesKey).map((s) => {
    const key = keyForSingleSeries(s);
    originalKeys.push(
      (s as SingleSeries & { columnValuesMapping?: Record<string, { originalName?: string }[]> })
        .columnValuesMapping?.[key]?.[0]?.originalName,
    );
    return key;
  });

  return getSeriesColors(keys, settings, originalKeys);
}
