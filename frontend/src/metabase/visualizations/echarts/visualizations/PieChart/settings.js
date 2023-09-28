import _ from "underscore";
import { t } from "ttag";

import { formatValue } from "metabase/lib/formatting";
import {
  metricSetting,
  dimensionSetting,
} from "metabase/visualizations/lib/settings/utils";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { getColorsForValues } from "metabase/lib/colors/charts";
import { DEFAULT_SLICE_THRESHOLD } from "metabase/visualizations/echarts/visualizations/PieChart/constants";

const getDimensionIndex = _.memoize((series, settings) => {
  const [
    {
      data: { cols },
    },
  ] = series;

  return _.findIndex(cols, col => col.name === settings["pie.dimension"]);
});

const getDimensionTitles = _.memoize((series, settings) => {
  const [
    {
      data: { rows, cols },
    },
  ] = series;

  const dimensionIndex = getDimensionIndex(series, settings);
  if (dimensionIndex == null || dimensionIndex < 0) {
    return null;
  }

  return rows.map(row =>
    formatValue(row[dimensionIndex], settings.column(cols[dimensionIndex])),
  );
});

const getDimensionValues = _.memoize((series, settings) => {
  const [
    {
      data: { rows },
    },
  ] = series;

  const dimensionIndex = getDimensionIndex(series, settings);
  if (dimensionIndex == null || dimensionIndex < 0) {
    return null;
  }

  return rows.map(row => String(row[dimensionIndex]));
});

export const PIE_CHART_SETTINGS = {
  ...columnSettings({ hidden: true }),
  ...dimensionSetting("pie.dimension", {
    section: t`Data`,
    title: t`Dimension`,
    showColumnSetting: true,
  }),
  ...metricSetting("pie.metric", {
    section: t`Data`,
    title: t`Measure`,
    showColumnSetting: true,
  }),
  "pie.show_legend": {
    section: t`Display`,
    title: t`Show legend`,
    widget: "toggle",
    default: true,
    inline: true,
    marginBottom: "1rem",
  },
  "pie.show_total": {
    section: t`Display`,
    title: t`Show total`,
    widget: "toggle",
    default: true,
    inline: true,
  },
  "pie.percent_visibility": {
    section: t`Display`,
    title: t`Show percentages`,
    widget: "radio",
    default: "legend",
    props: {
      options: [
        { name: t`Off`, value: "off" },
        { name: t`In legend`, value: "legend" },
        { name: t`On the chart`, value: "inside" },
      ],
    },
  },
  "pie.slice_threshold": {
    section: t`Display`,
    title: t`Minimum slice percentage`,
    widget: "number",
    default: DEFAULT_SLICE_THRESHOLD * 100,
  },
  "pie.colors": {
    section: t`Display`,
    title: t`Colors`,
    widget: "colors",
    getDefault: (series, settings) => {
      const dimensionValues = getDimensionValues(series, settings);
      return dimensionValues ? getColorsForValues(dimensionValues) : {};
    },
    getProps: (series, settings) => ({
      seriesValues: getDimensionValues(series, settings) || [],
      seriesTitles: getDimensionTitles(series, settings) || [],
    }),
    getDisabled: (series, settings) => !getDimensionValues(series, settings),
  },
  // this setting recomputes color assignment using pie.colors as the existing
  // assignments in case the user previous modified pie.colors and a new value
  // has appeared. Not ideal because those color values will be missing in the
  // settings UI
  "pie._colors": {
    getValue: (series, settings) =>
      getColorsForValues(
        getDimensionValues(series, settings),
        settings["pie.colors"],
      ),
    readDependencies: ["pie.colors"],
  },
};
