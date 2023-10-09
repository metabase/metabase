import { t } from "ttag";
import _ from "underscore";
import { getIn } from "icepick";

import ChartNestedSettingSeries from "metabase/visualizations/components/settings/ChartNestedSettingSeries";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { getNameForCard } from "../series";
import { nestedSettings } from "./nested";

export function keyForSingleSeries(single) {
  // _seriesKey is sometimes set by transformSeries
  return single.card._seriesKey || String(single.card.name);
}

const LINE_DISPLAY_TYPES = new Set(["line", "area"]);

export const SETTING_ID = "series_settings";
export const COLOR_SETTING_ID = "series_settings.colors";

export function seriesSetting({
  readDependencies = [],
  noPadding,
  ...def
} = {}) {
  const COMMON_SETTINGS = {
    // title, and color don't need widgets because they're handled direclty in ChartNestedSettingSeries
    title: {
      getDefault: (single, settings, { series, settings: vizSettings }) => {
        const legacyTitles = vizSettings["graph.series_labels"];
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
      getHidden: (single, settings, { series }) => {
        return (
          !["line", "area", "bar", "combo", "combo2"].includes(
            single.card.display,
          ) || settings["stackable.stack_type"] != null
        );
      },

      getDefault: (single, settings, { series }) => {
        if (
          single.card.display === "combo" ||
          single.card.display === "combo2"
        ) {
          const index = series.indexOf(single);
          if (index === 0) {
            return "line";
          } else {
            return "bar";
          }
        } else {
          return single.card.display;
        }
      },
    },
    color: {
      getDefault: (single, settings, { settings: vizSettings }) =>
        // get the color for series key, computed in the setting
        getIn(vizSettings, [COLOR_SETTING_ID, keyForSingleSeries(single)]),
    },
    "line.interpolate": {
      title: t`Line style`,
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
      getDefault: (single, settings, { settings: vizSettings }) =>
        // use legacy global line.interpolate setting if present
        vizSettings["line.interpolate"] || "linear",
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
        vizSettings["line.marker_enabled"] == null
          ? null
          : vizSettings["line.marker_enabled"],
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
      getHidden: (single, settings) =>
        !LINE_DISPLAY_TYPES.has(settings["display"]),
      getDefault: (single, settings, { settings: vizSettings }) =>
        // use legacy global line.missing setting if present
        vizSettings["line.missing"] || "interpolate",
      readDependencies: ["display"],
    },
    axis: {
      title: t`Y-axis position`,
      widget: "segmentedControl",
      default: null,
      getHidden: (single, settings) => single.card.display === "row",
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
      getHidden: (single, seriesSettings, { settings, series }) =>
        series.length <= 1 || // no need to show series-level control if there's only one series
        !Object.prototype.hasOwnProperty.call(settings, "graph.show_values") || // don't show it unless this chart has a global setting
        settings["stackable.stack_type"], // hide series controls if the chart is stacked
      getDefault: (single, seriesSettings, { settings }) =>
        settings["graph.show_values"],
      readDependencies: ["graph.show_values", "stackable.stack_type"],
    },
  };

  function getSettingDefinitionsForSingleSeries(series, object, settings) {
    return COMMON_SETTINGS;
  }

  return {
    ...nestedSettings(SETTING_ID, {
      getHidden: ([{ card }], settings, { isDashboard }) =>
        !isDashboard || card?.display === "waterfall",
      getSection: (series, settings, { isDashboard }) =>
        isDashboard ? t`Display` : t`Style`,
      objectName: "series",
      getObjects: (series, settings) => series,
      getObjectKey: keyForSingleSeries,
      getSettingDefinitionsForObject: getSettingDefinitionsForSingleSeries,
      component: ChartNestedSettingSeries,
      readDependencies: [COLOR_SETTING_ID, ...readDependencies],
      noPadding: true,
      getExtraProps: series => ({
        seriesCardNames: series.reduce((memo, singleSeries) => {
          memo[keyForSingleSeries(singleSeries)] = getNameForCard(
            singleSeries.card,
          );
          return memo;
        }, {}),
      }),
      ...def,
    }),
    // colors must be computed as a whole rather than individually
    [COLOR_SETTING_ID]: {
      getValue(series, settings) {
        const keys = series.map(single => keyForSingleSeries(single));

        const assignments = _.chain(keys)
          .map(key => [key, getIn(settings, [SETTING_ID, key, "color"])])
          .filter(([key, color]) => color != null)
          .object()
          .value();

        const legacyColors = settings["graph.colors"];
        if (legacyColors) {
          for (const [index, key] of keys.entries()) {
            if (!(key in assignments)) {
              assignments[key] = legacyColors[index];
            }
          }
        }

        return getColorsForValues(keys, assignments);
      },
    },
  };
}
