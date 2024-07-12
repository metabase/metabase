import { getIn } from "icepick";
import type React from "react";
import { t } from "ttag";
import _ from "underscore";

import ChartNestedSettingSeries from "metabase/visualizations/components/settings/ChartNestedSettingSeries";
import type { SeriesModel } from "metabase/visualizations/echarts/cartesian/model/types";
import {
  SERIES_COLORS_SETTING_KEY,
  getSeriesDefaultLinearInterpolate,
  getSeriesDefaultLineMarker,
  getSeriesDefaultLineMissing,
  getSeriesColors,
  getSeriesDefaultDisplay,
  SERIES_SETTING_KEY,
  getSeriesDefaultShowSeriesValues,
  getSeriesDefaultLineStyle,
  getSeriesDefaultLineSize,
} from "metabase/visualizations/shared/settings/series";
import type { RawSeries, SeriesSettings } from "metabase-types/api";

import { nestedSettings } from "./nested";

const LINE_DISPLAY_TYPES = new Set(["line", "area"]);

type ComputedSeriesSettings = NonNullableProps<
  SeriesSettings,
  "title" | "display"
>;

type NestedSettingsDefinition<
  TObject,
  TObjectSettings,
  TValue,
  TSettingsModel,
  TWidgetProps,
  TExtra,
> = {
  widget?: string | React.ReactNode;
  title?: string;
  props?: TWidgetProps;
  getDefault?: (
    object: TObject,
    settings: TObjectSettings,
    settingsModel: TSettingsModel,
    extra: TExtra,
  ) => TValue;
  getHidden?: (
    object: TObject,
    settings: TObjectSettings,
    settingsModel: TSettingsModel,
    extra: TExtra,
  ) => TValue;
  readDependencies?: string[];
};

type NestedSettingsDefinitions = Record<
  string,
  NestedSettingsDefinition<SeriesModel, SeriesSettings, unknown, unknown>
>;

export function seriesSetting({
  readDependencies = [],
  noPadding,
  ...def
} = {}): Record<
  string,
  NestedSettingsDefinition<SeriesModel, SeriesSettings, unknown, unknown>
> {
  const COMMON_SETTINGS: NestedSettingsDefinitions = {
    // title, and color don't need widgets because they're handled directly in ChartNestedSettingSeries
    title: {
      getDefault: (single, settings, settingsModel) => {
        return single.name;
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
      getHidden: (single, settings, settingsModel) => {
        return (
          !["line", "area", "bar", "combo"].includes(settingsModel.display) ||
          settings["stackable.stack_type"] != null
        );
      },

      getDefault: (single, settings, settingsModel) => {
        const index = settingsModel.seriesModels.find(
          sm => sm.vizSettingsKey === single.vizSettingsKey,
        );

        return getSeriesDefaultDisplay(settingsModel.display, index);
      },
    },
    color: {
      getDefault: (single, settings, { settings: vizSettings }) =>
        // get the color for series key, computed in the setting
        getIn(vizSettings, [SERIES_COLORS_SETTING_KEY, single.vizSettingsKey]),
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
      getHidden: (single, settings) =>
        !LINE_DISPLAY_TYPES.has(settings["display"]),
      getDefault: (
        single,
        settings,
        _settingsModel,
        { settings: vizSettings },
      ) =>
        // use legacy global line.interpolate setting if present
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
      getDefault: (series: SeriesModel, settings: SeriesSettings) =>
        getSeriesDefaultLineStyle(settings),
      getHidden: (seriesModel: SeriesModel, settings: SeriesSettings) =>
        !LINE_DISPLAY_TYPES.has(settings.display),
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
      getDefault: (series, settings) => getSeriesDefaultLineSize(settings),
      getHidden: (single, settings) =>
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
      getHidden: (single, settings) =>
        !LINE_DISPLAY_TYPES.has(settings["display"]),
      getDefault: (single, settings, { settings: vizSettings }) =>
        // use legacy global line.marker_enabled setting if present
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
      getHidden: (seriesModel: SeriesModel, settings: SeriesSettings) =>
        !LINE_DISPLAY_TYPES.has(settings["display"]),
      getDefault: (
        single,
        settings,
        settingsModel,
        { settings: vizSettings },
      ) =>
        // use legacy global line.missing setting if present
        getSeriesDefaultLineMissing(vizSettings),
      readDependencies: ["display"],
    },
    axis: {
      title: t`Y-axis position`,
      widget: "segmentedControl",
      default: null,
      getHidden: (single, settings, settingsModel) =>
        settingsModel.display === "row",
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
        single,
        seriesSettings,
        settingsModel,
        { settings, series },
      ) =>
        series.length <= 1 || // no need to show series-level control if there's only one series
        !settings["graph.show_values"] || // don't show it unless this chart has a global setting
        settings["stackable.stack_type"], // hide series controls if the chart is stacked
      getDefault: (single, seriesSettings, settingsModel, { settings }) =>
        getSeriesDefaultShowSeriesValues(settings),
      readDependencies: ["graph.show_values", "stackable.stack_type"],
    },
  };

  function getSettingDefinitionsForSingleSeries() {
    return COMMON_SETTINGS;
  }

  return {
    ...nestedSettings(SERIES_SETTING_KEY, {
      getHidden: ([{ card }], settings, { isDashboard }) =>
        !isDashboard || card?.display === "waterfall",
      getSection: (series, settings, { isDashboard }) =>
        isDashboard ? t`Display` : t`Style`,
      objectName: "series",
      getObjects: (series, settings, settingsModel) => {
        return settingsModel.seriesModels;
      },
      getObjectKey: seriesModel => seriesModel.vizSettingsKey,
      getSettingDefinitionsForObject: getSettingDefinitionsForSingleSeries,
      component: ChartNestedSettingSeries,
      readDependencies: [SERIES_COLORS_SETTING_KEY, ...readDependencies],
      noPadding: true,
      ...def,
    }),
    // colors must be computed as a whole rather than individually
    [SERIES_COLORS_SETTING_KEY]: {
      getValue(series, settings, settingsModel) {
        // const keys = series.map(single => keyForSingleSeries(single));
        const keys = settingsModel.seriesModels.map(s => s.vizSettingsKey);
        return getSeriesColors(keys, settings);
      },
    },
  };
}
