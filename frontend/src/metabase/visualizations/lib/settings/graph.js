import {
  isDimension,
  isMetric,
  isNumeric,
  isAny,
  isDate,
} from "metabase/lib/schema_metadata";
import { t } from "c-3po";
import {
  columnsAreValid,
  getFriendlyName,
  getChartTypeFromData,
  getColumnCardinality,
  DIMENSION_DIMENSION_METRIC,
  DIMENSION_METRIC,
  DIMENSION_METRIC_METRIC,
} from "metabase/visualizations/lib/utils";

import { seriesSetting } from "metabase/visualizations/lib/settings/series";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import { dimensionIsNumeric } from "metabase/visualizations/lib/numeric";
import { dimensionIsTimeseries } from "metabase/visualizations/lib/timeseries";

import _ from "underscore";

// NOTE: currently we don't consider any date extracts to be histgrams
const HISTOGRAM_DATE_EXTRACTS = new Set([
  // "minute-of-hour",
  // "hour-of-day",
  // "day-of-month",
  // "day-of-year",
  // "week-of-year",
]);

export function getDefaultColumns(series) {
  if (series[0].card.display === "scatter") {
    return getDefaultScatterColumns(series);
  } else {
    return getDefaultLineAreaBarColumns(series);
  }
}

function getDefaultScatterColumns([{ data: { cols, rows } }]) {
  let dimensions = cols.filter(isDimension);
  let metrics = cols.filter(isMetric);
  if (dimensions.length === 2 && metrics.length < 2) {
    return {
      dimensions: [dimensions[0].name],
      metrics: [dimensions[1].name],
      bubble: metrics.length === 1 ? metrics[0].name : null,
    };
  } else {
    return {
      dimensions: [null],
      metrics: [null],
      bubble: null,
    };
  }
}

function getDefaultLineAreaBarColumns([{ data: { cols, rows } }]) {
  let type = getChartTypeFromData(cols, rows, false);
  if (type === DIMENSION_DIMENSION_METRIC) {
    let dimensions = [cols[0], cols[1]];
    if (isDate(dimensions[1]) && !isDate(dimensions[0])) {
      // if the series dimension is a date but the axis dimension is not then swap them
      dimensions.reverse();
    } else if (
      getColumnCardinality(cols, rows, 1) > getColumnCardinality(cols, rows, 0)
    ) {
      // if the series dimension is higher cardinality than the axis dimension then swap them
      dimensions.reverse();
    }
    return {
      dimensions: dimensions.map(col => col.name),
      metrics: [cols[2].name],
    };
  } else if (type === DIMENSION_METRIC) {
    return {
      dimensions: [cols[0].name],
      metrics: [cols[1].name],
    };
  } else if (type === DIMENSION_METRIC_METRIC) {
    return {
      dimensions: [cols[0].name],
      metrics: cols.slice(1).map(col => col.name),
    };
  }
  return {
    dimensions: [null],
    metrics: [null],
  };
}

export const GRAPH_DATA_SETTINGS = {
  ...columnSettings({
    getColumns: ([{ data: { cols } }], settings) => cols,
    hidden: true,
  }),
  "graph._dimension_filter": {
    getDefault: ([{ card }]) =>
      card.display === "scatter" ? isAny : isDimension,
    useRawSeries: true,
  },
  "graph._metric_filter": {
    getDefault: ([{ card }]) =>
      card.display === "scatter" ? isNumeric : isMetric,
    useRawSeries: true,
  },
  "graph.dimensions": {
    section: t`Data`,
    title: t`X-axis`,
    widget: "fields",
    isValid: ([{ card, data }], vizSettings) =>
      columnsAreValid(
        card.visualization_settings["graph.dimensions"],
        data,
        vizSettings["graph._dimension_filter"],
      ) &&
      columnsAreValid(
        card.visualization_settings["graph.metrics"],
        data,
        vizSettings["graph._metric_filter"],
      ),
    getDefault: (series, vizSettings) => getDefaultColumns(series).dimensions,
    persistDefault: true,
    getProps: ([{ card, data }], vizSettings) => {
      const value = vizSettings["graph.dimensions"];
      const options = data.cols
        .filter(vizSettings["graph._dimension_filter"])
        .map(getOptionFromColumn);
      return {
        options,
        addAnother:
          options.length > value.length &&
          value.length < 2 &&
          vizSettings["graph.metrics"].length < 2
            ? t`Add a series breakout...`
            : null,
        columns: data.cols,
        showColumnSetting: true,
      };
    },
    readDependencies: ["graph._dimension_filter", "graph._metric_filter"],
    writeDependencies: ["graph.metrics"],
    dashboard: false,
    useRawSeries: true,
  },
  "graph.metrics": {
    section: t`Data`,
    title: t`Y-axis`,
    widget: "fields",
    isValid: ([{ card, data }], vizSettings) =>
      columnsAreValid(
        card.visualization_settings["graph.dimensions"],
        data,
        vizSettings["graph._dimension_filter"],
      ) &&
      columnsAreValid(
        card.visualization_settings["graph.metrics"],
        data,
        vizSettings["graph._metric_filter"],
      ),
    getDefault: (series, vizSettings) => getDefaultColumns(series).metrics,
    persistDefault: true,
    getProps: ([{ card, data }], vizSettings) => {
      const value = vizSettings["graph.dimensions"];
      const options = data.cols
        .filter(vizSettings["graph._metric_filter"])
        .map(getOptionFromColumn);
      return {
        options,
        addAnother:
          options.length > value.length &&
          vizSettings["graph.dimensions"].length < 2
            ? t`Add another series...`
            : null,
        columns: data.cols,
        showColumnSetting: true,
      };
    },
    readDependencies: ["graph._dimension_filter", "graph._metric_filter"],
    writeDependencies: ["graph.dimensions"],
    dashboard: false,
    useRawSeries: true,
  },
  ...seriesSetting(),
};

export const GRAPH_BUBBLE_SETTINGS = {
  "scatter.bubble": {
    section: t`Data`,
    title: t`Bubble size`,
    widget: "field",
    isValid: ([{ card, data }], vizSettings) =>
      columnsAreValid(
        [card.visualization_settings["scatter.bubble"]],
        data,
        isNumeric,
      ),
    getDefault: series => getDefaultColumns(series).bubble,
    getProps: ([{ card, data }], vizSettings, onChange) => {
      const options = data.cols.filter(isNumeric).map(getOptionFromColumn);
      return {
        options,
        onRemove: vizSettings["scatter.bubble"] ? () => onChange(null) : null,
      };
    },
    writeDependencies: ["graph.dimensions"],
    dashboard: false,
    useRawSeries: true,
  },
};

export const LINE_SETTINGS = {
  // DEPRECATED: moved to series settings
  "line.interpolate": {
    default: "linear",
  },
  // DEPRECATED: moved to series settings
  "line.marker_enabled": {},
  // DEPRECATED: moved to series settings
  "line.missing": {
    default: "interpolate",
  },
};

const STACKABLE_DISPLAY_TYPES = new Set(["area", "bar"]);

export const STACKABLE_SETTINGS = {
  "stackable.stack_type": {
    section: t`Display`,
    title: t`Stacking`,
    widget: "radio",
    props: {
      options: [
        { name: t`Don't stack`, value: null },
        { name: t`Stack`, value: "stacked" },
        { name: t`Stack - 100%`, value: "normalized" },
      ],
    },
    isValid: (series, settings) => {
      if (settings["stackable.stack_type"] != null) {
        const displays = series.map(single => settings.series(single).display);
        const hasStackable = _.any(displays, display =>
          STACKABLE_DISPLAY_TYPES.has(display),
        );
        return hasStackable;
      }
      return true;
    },
    getDefault: ([{ card, data }], settings) =>
      // legacy setting and default for D-M-M+ charts
      settings["stackable.stacked"] ||
      (card.display === "area" && settings["graph.metrics"].length > 1)
        ? "stacked"
        : null,
    getHidden: (series, settings) => {
      if (series.length < 2) {
        return true;
      }
      const displays = series.map(single => settings.series(single).display);
      return !_.any(displays, display => STACKABLE_DISPLAY_TYPES.has(display));
    },
    readDependencies: ["graph.metrics", "series"],
  },
  "stackable.stack_display": {
    section: t`Display`,
    title: t`Stacked chart type`,
    widget: "buttonGroup",
    props: {
      options: [
        { icon: "area", name: t`Area`, value: "area" },
        { icon: "bar", name: t`Bar`, value: "bar" },
      ],
    },
    getDefault: (series, settings) => {
      const displays = series.map(single => settings.series(single).display);
      const firstStackable = _.find(displays, display =>
        STACKABLE_DISPLAY_TYPES.has(display),
      );
      if (firstStackable) {
        return firstStackable;
      }
      if (STACKABLE_DISPLAY_TYPES.has(series[0].card.display)) {
        return series[0].card.display;
      }
      return "bar";
    },
    getHidden: (series, settings) => settings["stackable.stack_type"] == null,
    readDependencies: ["stackable.stack_type", "series"],
  },
};

export const GRAPH_GOAL_SETTINGS = {
  "graph.show_goal": {
    section: t`Display`,
    title: t`Show goal`,
    widget: "toggle",
    default: false,
  },
  "graph.goal_value": {
    section: t`Display`,
    title: t`Goal value`,
    widget: "number",
    default: 0,
    getHidden: (series, vizSettings) => vizSettings["graph.show_goal"] !== true,
    readDependencies: ["graph.show_goal"],
  },
  "graph.goal_label": {
    section: t`Display`,
    title: t`Goal label`,
    widget: "input",
    default: t`Goal`,
    getHidden: (series, vizSettings) => vizSettings["graph.show_goal"] !== true,
    readDependencies: ["graph.show_goal"],
  },
  "graph.show_trendline": {
    section: t`Display`,
    title: t`Show trend line`,
    widget: "toggle",
    default: false,
    getHidden: (series, vizSettings) => {
      const { insights } = series[0].data;
      return !insights || insights.length === 0;
    },
    useRawSeries: true,
  },
};

export const GRAPH_COLORS_SETTINGS = {
  // DEPRECATED: replaced with "color" series setting
  "graph.colors": {},
};

export const GRAPH_AXIS_SETTINGS = {
  "graph.x_axis._is_timeseries": {
    readDependencies: ["graph.dimensions"],
    getDefault: ([{ data }], vizSettings) =>
      dimensionIsTimeseries(
        data,
        _.findIndex(
          data.cols,
          c => c.name === vizSettings["graph.dimensions"].filter(d => d)[0],
        ),
      ),
  },
  "graph.x_axis._is_numeric": {
    readDependencies: ["graph.dimensions"],
    getDefault: ([{ data }], vizSettings) =>
      dimensionIsNumeric(
        data,
        _.findIndex(
          data.cols,
          c => c.name === vizSettings["graph.dimensions"].filter(d => d)[0],
        ),
      ),
  },
  "graph.x_axis._is_histogram": {
    getDefault: ([{ data: { cols } }], vizSettings) =>
      // matches binned numeric columns
      cols[0].binning_info != null ||
      // matches certain date extracts like day-of-week, etc
      // NOTE: currently disabled
      HISTOGRAM_DATE_EXTRACTS.has(cols[0].unit),
  },
  "graph.x_axis.scale": {
    section: t`Axes`,
    title: t`X-axis scale`,
    widget: "select",
    default: "ordinal",
    readDependencies: [
      "graph.x_axis._is_timeseries",
      "graph.x_axis._is_numeric",
      "graph.x_axis._is_histogram",
    ],
    getDefault: (series, vizSettings) =>
      vizSettings["graph.x_axis._is_histogram"]
        ? "histogram"
        : vizSettings["graph.x_axis._is_timeseries"]
          ? "timeseries"
          : vizSettings["graph.x_axis._is_numeric"] ? "linear" : "ordinal",
    getProps: (series, vizSettings) => {
      const options = [];
      if (vizSettings["graph.x_axis._is_timeseries"]) {
        options.push({ name: t`Timeseries`, value: "timeseries" });
      }
      if (vizSettings["graph.x_axis._is_numeric"]) {
        options.push({ name: t`Linear`, value: "linear" });
        if (!vizSettings["graph.x_axis._is_histogram"]) {
          options.push({ name: t`Power`, value: "pow" });
          options.push({ name: t`Log`, value: "log" });
        }
        options.push({ name: t`Histogram`, value: "histogram" });
      }
      options.push({ name: t`Ordinal`, value: "ordinal" });
      return { options };
    },
  },
  "graph.y_axis.scale": {
    section: t`Axes`,
    title: t`Y-axis scale`,
    widget: "select",
    default: "linear",
    getProps: (series, vizSettings) => ({
      options: [
        { name: t`Linear`, value: "linear" },
        { name: t`Power`, value: "pow" },
        { name: t`Log`, value: "log" },
      ],
    }),
  },
  "graph.x_axis.axis_enabled": {
    section: t`Axes`,
    title: t`Show x-axis line and marks`,
    widget: "select",
    props: {
      options: [
        { name: t`Hide`, value: false },
        { name: t`Show`, value: true },
        { name: t`Compact`, value: "compact" },
        { name: t`Rotate 45°`, value: "rotate-45" },
        { name: t`Rotate 90°`, value: "rotate-90" },
      ],
    },
    default: true,
  },
  "graph.y_axis.axis_enabled": {
    section: t`Axes`,
    title: t`Show y-axis line and marks`,
    widget: "select",
    props: {
      options: [
        { name: t`Hide`, value: false },
        { name: t`Show`, value: true },
      ],
    },
    default: true,
  },
  "graph.y_axis.auto_range": {
    section: t`Axes`,
    title: t`Auto y-axis range`,
    widget: "toggle",
    default: true,
  },
  "graph.y_axis.min": {
    section: t`Axes`,
    title: t`Min`,
    widget: "number",
    default: 0,
    getHidden: (series, vizSettings) =>
      vizSettings["graph.y_axis.auto_range"] !== false,
  },
  "graph.y_axis.max": {
    section: t`Axes`,
    title: t`Max`,
    widget: "number",
    default: 100,
    getHidden: (series, vizSettings) =>
      vizSettings["graph.y_axis.auto_range"] !== false,
  },
  /*
  "graph.y_axis_right.auto_range": {
      section: t`Axes`,
      title: t`Auto right-hand y-axis range`,
      widget: "toggle",
      default: true
  },
  "graph.y_axis_right.min": {
      section: t`Axes`,
      title: t`Min`,
      widget: "number",
      default: 0,
      getHidden: (series, vizSettings) => vizSettings["graph.y_axis_right.auto_range"] !== false
  },
  "graph.y_axis_right.max": {
      section: t`Axes`,
      title: t`Max`,
      widget: "number",
      default: 100,
      getHidden: (series, vizSettings) => vizSettings["graph.y_axis_right.auto_range"] !== false
  },
*/
  "graph.y_axis.auto_split": {
    section: t`Axes`,
    title: t`Use a split y-axis when necessary`,
    widget: "toggle",
    default: true,
    getHidden: series => series.length < 2,
  },
  "graph.x_axis.labels_enabled": {
    section: t`Labels`,
    title: t`Show label on x-axis`,
    widget: "toggle",
    default: true,
  },
  "graph.x_axis.title_text": {
    section: t`Labels`,
    title: t`X-axis label`,
    widget: "input",
    getHidden: (series, vizSettings) =>
      vizSettings["graph.x_axis.labels_enabled"] === false,
    getDefault: (series, vizSettings) =>
      series.length === 1 ? getFriendlyName(series[0].data.cols[0]) : null,
  },
  "graph.y_axis.labels_enabled": {
    section: t`Labels`,
    title: t`Show label on y-axis`,
    widget: "toggle",
    default: true,
  },
  "graph.y_axis.title_text": {
    section: t`Labels`,
    title: t`Y-axis label`,
    widget: "input",
    getHidden: (series, vizSettings) =>
      vizSettings["graph.y_axis.labels_enabled"] === false,
    getDefault: (series, vizSettings) =>
      series.length === 1 ? vizSettings.series(series[0]).title : null,
    readDependencies: ["series"],
  },
  // DEPRECATED" replaced with "label" series setting
  "graph.series_labels": {},
};
