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
    getDefault: (series, settings) =>
      settings["pie._dimensionValues"]
        ? getColorsForValues(settings["pie._dimensionValues"])
        : {},
    getProps: (series, settings) => ({
      seriesValues: settings["pie._dimensionValues"] || [],
      seriesTitles: settings["pie._dimensionTitles"] || [],
    }),
    getDisabled: (series, settings) => !settings["pie._dimensionValues"],
    readDependencies: ["pie._dimensionValues", "pie._dimensionTitles"],
  },
  // this setting recomputes color assignment using pie.colors as the existing
  // assignments in case the user previous modified pie.colors and a new value
  // has appeared. Not ideal because those color values will be missing in the
  // settings UI
  "pie._colors": {
    getValue: (series, settings) =>
      getColorsForValues(
        settings["pie._dimensionValues"],
        settings["pie.colors"],
      ),
    readDependencies: ["pie._dimensionValues", "pie.colors"],
  },
  // TODO: remove
  "pie._metricIndex": {
    getValue: (
      [
        {
          data: { cols },
        },
      ],
      settings,
    ) => _.findIndex(cols, col => col.name === settings["pie.metric"]),
    readDependencies: ["pie.metric"],
  },
  // TODO: remove
  "pie._dimensionIndex": {
    getValue: (
      [
        {
          data: { cols },
        },
      ],
      settings,
    ) => _.findIndex(cols, col => col.name === settings["pie.dimension"]),
    readDependencies: ["pie.dimension"],
  },
  // TODO: remove
  "pie._dimensionValues": {
    getValue: (
      [
        {
          data: { rows },
        },
      ],
      settings,
    ) => {
      const dimensionIndex = settings["pie._dimensionIndex"];
      if (dimensionIndex == null || dimensionIndex < 0) {
        return null;
      }

      return rows.map(row => String(row[dimensionIndex]));
    },
    readDependencies: ["pie._dimensionIndex"],
  },
  // TODO: remove
  "pie._dimensionTitles": {
    getValue: (
      [
        {
          data: { rows, cols },
        },
      ],
      settings,
    ) => {
      const dimensionIndex = settings["pie._dimensionIndex"];
      if (dimensionIndex == null || dimensionIndex < 0) {
        return null;
      }

      return rows.map(row =>
        formatValue(row[dimensionIndex], settings.column(cols[dimensionIndex])),
      );
    },
    readDependencies: ["pie._dimensionIndex"],
  },
};
