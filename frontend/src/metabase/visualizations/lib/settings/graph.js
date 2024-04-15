import { t } from "ttag";
import _ from "underscore";

import {
  getMaxMetricsSupported,
  getMaxDimensionsSupported,
} from "metabase/visualizations";
import { ChartSettingOrderedSimple } from "metabase/visualizations/components/settings/ChartSettingOrderedSimple";
import { dimensionIsNumeric } from "metabase/visualizations/lib/numeric";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  seriesSetting,
  keyForSingleSeries,
} from "metabase/visualizations/lib/settings/series";
import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import { dimensionIsTimeseries } from "metabase/visualizations/lib/timeseries";
import {
  columnsAreValid,
  getDefaultDimensionsAndMetrics,
  preserveExistingColumnsOrder,
  MAX_SERIES,
} from "metabase/visualizations/lib/utils";
import {
  getDefaultIsHistogram,
  getDefaultScatterColumns,
  getDefaultStackingValue,
  getDefaultStackDisplayValue,
  getDefaultXAxisScale,
  getDefaultXAxisTitle,
  getDefaultYAxisTitle,
  getIsXAxisLabelEnabledDefault,
  getIsYAxisLabelEnabledDefault,
  getSeriesOrderVisibilitySettings,
  getYAxisAutoRangeDefault,
  getYAxisAutoRangeIncludeZero,
  isStackingValueValid,
  isXAxisScaleValid,
  getDefaultLegendIsReversed,
  getDefaultShowDataLabels,
  getDefaultDataLabelsFrequency,
  STACKABLE_DISPLAY_TYPES,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import {
  isDate,
  isDimension,
  isMetric,
  isNumeric,
  isAny,
} from "metabase-lib/v1/types/utils/isa";

export function getDefaultDimensionLabel(multipleSeries) {
  return getDefaultXAxisTitle(multipleSeries[0]?.data.cols[0]);
}

export function getDefaultColumns(series) {
  if (series[0].card.display === "scatter") {
    return getDefaultScatterColumns(series[0].data);
  } else {
    return getDefaultLineAreaBarColumns(series);
  }
}

function getDefaultLineAreaBarColumns(series) {
  const [
    {
      card: { display },
    },
  ] = series;
  return getDefaultDimensionsAndMetrics(
    series,
    getMaxDimensionsSupported(display),
  );
}

export const GRAPH_DATA_SETTINGS = {
  ...columnSettings({
    getColumns: ([
      {
        data: { cols },
      },
    ]) => cols,
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
    getMarginBottom: (series, vizSettings) =>
      vizSettings["graph.dimensions"]?.length === 2 &&
      series.length <= MAX_SERIES
        ? "0.5rem"
        : "1rem",
    isValid: (series, vizSettings) =>
      series.some(
        ({ card, data }) =>
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
      ),
    getDefault: (series, vizSettings) =>
      preserveExistingColumnsOrder(
        vizSettings["graph.dimensions"] ?? [],
        getDefaultColumns(series).dimensions,
      ),
    persistDefault: true,
    getProps: ([{ card, data }], vizSettings) => {
      const addedDimensions = vizSettings["graph.dimensions"];
      const maxDimensionsSupported = getMaxDimensionsSupported(card.display);
      const options = data.cols
        .filter(vizSettings["graph._dimension_filter"])
        .map(getOptionFromColumn);
      return {
        options,
        addAnother:
          options.length > addedDimensions.length &&
          addedDimensions.length < maxDimensionsSupported &&
          addedDimensions.every(
            dimension => dimension !== undefined && dimension !== null,
          ) &&
          vizSettings["graph.metrics"].length < 2
            ? t`Add series breakout`
            : null,
        columns: data.cols,
        // When this prop is passed it will only show the
        // column settings for any index that is included in the array
        showColumnSettingForIndicies: [0],
      };
    },
    readDependencies: ["graph._dimension_filter", "graph._metric_filter"],
    writeDependencies: ["graph.metrics"],
    eraseDependencies: ["graph.series_order_dimension", "graph.series_order"],
    dashboard: false,
    useRawSeries: true,
  },
  "graph.series_order_dimension": {
    getValue: (_series, settings) => settings["graph.dimensions"][1],
    // This read dependency is set so that "graph.series_order" is computed *before* this value, ensuring that
    // that it uses the stored value if one exists. This is needed to check if the dimension has actually changed
    readDependencies: ["graph.series_order"],
  },
  "graph.series_order": {
    section: t`Data`,
    widget: ChartSettingOrderedSimple,
    marginBottom: "1rem",

    getValue: (series, settings) => {
      const seriesKeys = series.map(s => keyForSingleSeries(s));
      return getSeriesOrderVisibilitySettings(settings, seriesKeys);
    },
    getHidden: (series, settings) => {
      return (
        settings["graph.dimensions"]?.length < 2 || series.length > MAX_SERIES
      );
    },
    dashboard: false,
    readDependencies: ["series_settings.colors", "series_settings"],
    writeDependencies: ["graph.series_order_dimension"],
  },
  "graph.metrics": {
    section: t`Data`,
    title: t`Y-axis`,
    widget: "fields",
    isValid: (series, vizSettings) =>
      series.some(
        ({ card, data }) =>
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
      ),
    getDefault: series => getDefaultColumns(series).metrics,
    persistDefault: true,
    getProps: ([{ card, data }], vizSettings, _onChange, extra) => {
      const options = data.cols
        .filter(vizSettings["graph._metric_filter"])
        .map(getOptionFromColumn);

      const addedMetrics = vizSettings["graph.metrics"];
      const hasBreakout = vizSettings["graph.dimensions"].length > 1;
      const addedMetricsCount = addedMetrics.length;
      const maxMetricsSupportedCount = getMaxMetricsSupported(card.display);

      const hasMetricsToAdd = options.length > addedMetricsCount;
      const canAddAnother =
        addedMetricsCount < maxMetricsSupportedCount &&
        hasMetricsToAdd &&
        !hasBreakout &&
        addedMetrics.every(metric => metric != null);

      return {
        options,
        addAnother: canAddAnother ? t`Add another series` : null,
        columns: data.cols,
        showColumnSetting: true,
        showColorPicker: !hasBreakout,
        colors: vizSettings["series_settings.colors"],
        series: extra.transformedSeries,
      };
    },
    readDependencies: [
      "graph._dimension_filter",
      "graph._metric_filter",
      "series_settings.colors",
    ],
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
    isValid: (series, vizSettings) =>
      series.some(({ card, data }) =>
        columnsAreValid(
          [card.visualization_settings["scatter.bubble"]],
          data,
          isNumeric,
        ),
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
      const seriesDisplays = series.map(
        single => settings.series(single).display,
      );

      return isStackingValueValid(
        series[0].card.display,
        settings,
        seriesDisplays,
      );
    },
    getDefault: ([{ card, data }], settings) => {
      return getDefaultStackingValue(settings, card);
    },
    getHidden: (series, settings) => {
      const displays = series.map(single => settings.series(single).display);
      const stackableDisplays = displays.filter(display =>
        STACKABLE_DISPLAY_TYPES.has(display),
      );

      return stackableDisplays.length <= 1;
    },
    readDependencies: ["graph.metrics", "graph.dimensions", "series"],
  },
  "stackable.stack_display": {
    section: t`Display`,
    title: t`Stacked chart type`,
    widget: "segmentedControl",
    props: {
      options: [
        { icon: "area", value: "area" },
        { icon: "bar", value: "bar" },
      ],
    },
    getDefault: (series, settings) => {
      const displays = series.map(single => settings.series(single).display);
      return getDefaultStackDisplayValue(series[0].card.display, displays);
    },
    getHidden: (series, settings) => settings["stackable.stack_type"] == null,
    readDependencies: ["stackable.stack_type", "series"],
  },
};

export const LEGEND_SETTINGS = {
  "legend.is_reversed": {
    getDefault: (_series, settings) => getDefaultLegendIsReversed(settings),
    hidden: true,
    readDependencies: ["stackable.stack_display"],
  },
};

export const TOOLTIP_SETTINGS = {
  "graph.tooltip_type": {
    getDefault: (_series, settings) => {
      const shouldShowComparisonTooltip =
        settings["stackable.stack_display"] != null &&
        settings["stackable.stack_type"] != null;
      return shouldShowComparisonTooltip ? "series_comparison" : "default";
    },
    hidden: true,
    readDependencies: ["stackable.stack_display"],
  },
};

export const GRAPH_TREND_SETTINGS = {
  "graph.show_trendline": {
    section: t`Display`,
    title: t`Trend line`,
    widget: "toggle",
    default: false,
    getHidden: (series, vizSettings) => {
      const { insights } = series[0].data;
      return !insights || insights.length === 0;
    },
    useRawSeries: true,
    inline: true,
    marginBottom: "1rem",
  },
};

export const GRAPH_DISPLAY_VALUES_SETTINGS = {
  "graph.show_values": {
    section: t`Display`,
    title: t`Show values on data points`,
    widget: "toggle",
    getHidden: (series, vizSettings) =>
      vizSettings["stackable.stack_type"] === "normalized",
    getDefault: getDefaultShowDataLabels,
    inline: true,
    marginBottom: "1rem",
  },
  "graph.label_value_frequency": {
    section: t`Display`,
    title: t`Values to show`,
    widget: "segmentedControl",
    getHidden: (series, vizSettings) =>
      vizSettings["graph.show_values"] !== true ||
      vizSettings["stackable.stack_type"] === "normalized",
    props: {
      options: [
        { name: t`Some`, value: "fit" },
        { name: t`All`, value: "all" },
      ],
    },
    getDefault: getDefaultDataLabelsFrequency,
    readDependencies: ["graph.show_values"],
  },
  "graph.label_value_formatting": {
    section: t`Display`,
    title: t`Auto formatting`,
    widget: "segmentedControl",
    getHidden: (series, vizSettings) =>
      vizSettings["graph.show_values"] !== true ||
      vizSettings["stackable.stack_type"] === "normalized",
    props: {
      options: [
        { name: t`Auto`, value: "auto" },
        { name: t`Compact`, value: "compact" },
        { name: t`Full`, value: "full" },
      ],
    },
    default: "auto",
    readDependencies: ["graph.show_values"],
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
    getDefault: ([{ data }], vizSettings) => {
      return dimensionIsNumeric(
        data,
        _.findIndex(
          data.cols,
          c => c.name === vizSettings["graph.dimensions"].filter(d => d)[0],
        ),
      );
    },
  },
  "graph.x_axis._is_histogram": {
    getDefault: (
      [
        {
          data: { cols },
        },
      ],
      vizSettings,
    ) => getDefaultIsHistogram(cols[0]),
  },
  "graph.x_axis.scale": {
    section: t`Axes`,
    group: t`X-axis`,
    title: t`Scale`,
    index: 4,
    widget: "select",
    readDependencies: [
      "graph.x_axis._is_timeseries",
      "graph.x_axis._is_numeric",
      "graph.x_axis._is_histogram",
    ],
    isValid: isXAxisScaleValid,
    getDefault: (series, vizSettings) => getDefaultXAxisScale(vizSettings),
    getProps: ([{ data }], vizSettings) => {
      const dimensionColumn = data.cols.find(
        col => col.name === vizSettings["graph.dimensions"][0],
      );

      const options = [];
      if (vizSettings["graph.x_axis._is_timeseries"]) {
        options.push({ name: t`Timeseries`, value: "timeseries" });
      }
      if (vizSettings["graph.x_axis._is_numeric"]) {
        options.push({ name: t`Linear`, value: "linear" });
        // For relative date units such as day of week we do not want to show log, pow, histogram scales
        if (!isDate(dimensionColumn)) {
          if (!vizSettings["graph.x_axis._is_histogram"]) {
            options.push({ name: t`Power`, value: "pow" });
            options.push({ name: t`Log`, value: "log" });
          }
          options.push({ name: t`Histogram`, value: "histogram" });
        }
      }
      options.push({ name: t`Ordinal`, value: "ordinal" });
      return { options };
    },
  },
  "graph.y_axis.scale": {
    section: t`Axes`,
    title: t`Scale`,
    index: 7,
    group: t`Y-axis`,
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
    group: t`X-axis`,
    title: t`Show lines and marks`,
    index: 3,
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
    title: t`Show lines and marks`,
    index: 8,
    group: t`Y-axis`,
    widget: "select",
    props: {
      options: [
        { name: t`Hide`, value: false },
        { name: t`Show`, value: true },
      ],
    },
    default: true,
  },
  "graph.y_axis.auto_range_include_zero": {
    hidden: true,
    getDefault: series => {
      return getYAxisAutoRangeIncludeZero(series[0].card.display);
    },
  },
  "graph.y_axis.auto_range": {
    section: t`Axes`,
    group: t`Y-axis`,
    index: 4,
    title: t`Auto y-axis range`,
    inline: true,
    widget: "toggle",
    getDefault: getYAxisAutoRangeDefault,
  },
  "graph.y_axis.min": {
    section: t`Axes`,
    group: t`Y-axis`,
    index: 5,
    title: t`Min`,
    widget: "number",
    default: 0,
    getHidden: (series, vizSettings) =>
      vizSettings["graph.y_axis.auto_range"] !== false,
  },
  "graph.y_axis.max": {
    section: t`Axes`,
    group: t`Y-axis`,
    index: 6,
    title: t`Max`,
    widget: "number",
    default: 100,
    getHidden: (series, vizSettings) =>
      vizSettings["graph.y_axis.auto_range"] !== false,
  },
  "graph.y_axis.auto_split": {
    section: t`Axes`,
    group: t`Y-axis`,
    index: 3,
    title: t`Split y-axis when necessary`,
    widget: "toggle",
    inline: true,
    default: true,
    getHidden: series => series.length < 2,
  },
  "graph.x_axis.labels_enabled": {
    section: t`Axes`,
    group: t`X-axis`,
    index: 1,
    title: t`Show label`,
    inline: true,
    widget: "toggle",
    getDefault: getIsXAxisLabelEnabledDefault,
  },
  "graph.x_axis.title_text": {
    section: t`Axes`,
    title: t`Label`,
    index: 2,
    group: t`X-axis`,
    widget: "input",
    getHidden: (series, vizSettings) =>
      vizSettings["graph.x_axis.labels_enabled"] === false,
    getDefault: getDefaultDimensionLabel,
    getProps: series => ({
      placeholder: getDefaultDimensionLabel(series),
    }),
  },
  "graph.y_axis.labels_enabled": {
    section: t`Axes`,
    title: t`Show label`,
    index: 1,
    group: t`Y-axis`,
    widget: "toggle",
    inline: true,
    getDefault: getIsYAxisLabelEnabledDefault,
  },
  "graph.y_axis.title_text": {
    section: t`Axes`,
    title: t`Label`,
    index: 2,
    group: t`Y-axis`,
    widget: "input",
    getHidden: (series, vizSettings) =>
      vizSettings["graph.y_axis.labels_enabled"] === false,
    getDefault: (series, vizSettings) => {
      // If there are multiple series, we check if the metric names match.
      // If they do, we use that as the default y axis label.
      const [metric] = vizSettings["graph.metrics"];
      const metricNames = series.map(({ data: { cols } }) => {
        const metricCol = cols.find(c => c.name === metric);
        return metricCol && metricCol.display_name;
      });

      return getDefaultYAxisTitle(metricNames);
    },
    readDependencies: ["series", "graph.metrics"],
  },
  // DEPRECATED" replaced with "label" series setting
  "graph.series_labels": {},
};
