import { t } from "ttag";
import _ from "underscore";

import { color } from "metabase/lib/colors";
import {
  getMaxDimensionsSupported,
  getMaxMetricsSupported,
} from "metabase/visualizations";
import { ChartSettingMaxCategories } from "metabase/visualizations/components/settings/ChartSettingMaxCategories";
import { ChartSettingSeriesOrder } from "metabase/visualizations/components/settings/ChartSettingSeriesOrder";
import { dimensionIsNumeric } from "metabase/visualizations/lib/numeric";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { seriesSetting } from "metabase/visualizations/lib/settings/series";
import { getOptionFromColumn } from "metabase/visualizations/lib/settings/utils";
import { dimensionIsTimeseries } from "metabase/visualizations/lib/timeseries";
import { MAX_SERIES, columnsAreValid } from "metabase/visualizations/lib/utils";
import {
  STACKABLE_SERIES_DISPLAY_TYPES,
  getAreDimensionsAndMetricsValid,
  getAvailableAdditionalColumns,
  getAvailableXAxisScales,
  getComputedAdditionalColumnsValue,
  getDefaultColumns,
  getDefaultDataLabelsFormatting,
  getDefaultDataLabelsFrequency,
  getDefaultDimensionFilter,
  getDefaultDimensions,
  getDefaultIsAutoSplitEnabled,
  getDefaultIsHistogram,
  getDefaultLegendIsReversed,
  getDefaultMetricFilter,
  getDefaultMetrics,
  getDefaultShowDataLabels,
  getDefaultShowStackValues,
  getDefaultStackingValue,
  getDefaultXAxisScale,
  getDefaultXAxisTitle,
  getDefaultYAxisTitle,
  getIsXAxisLabelEnabledDefault,
  getIsYAxisLabelEnabledDefault,
  getSeriesModelsForSettings,
  getSeriesOrderDimensionSetting,
  getSeriesOrderVisibilitySettings,
  getYAxisAutoRangeDefault,
  getYAxisUnpinFromZeroDefault,
  isShowStackValuesValid,
  isStackingValueValid,
  isXAxisScaleValid,
  isYAxisUnpinFromZeroValid,
} from "metabase/visualizations/shared/settings/cartesian-chart";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import { isNumeric } from "metabase-lib/v1/types/utils/isa";

export const getSeriesDisplays = (transformedSeries, settings) => {
  return transformedSeries.map(single => settings.series(single).display);
};

export function getDefaultDimensionLabel(multipleSeries) {
  return getDefaultXAxisTitle(multipleSeries[0]?.data.cols[0]);
}

function canHaveDataLabels(series, vizSettings) {
  const areAllAreas = getSeriesDisplays(series, vizSettings).every(
    display => display === "area",
  );
  return vizSettings["stackable.stack_type"] !== "normalized" || !areAllAreas;
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
  "graph.dimensions": {
    section: t`Data`,
    title: t`X-axis`,
    widget: "fields",
    getMarginBottom: (series, vizSettings) =>
      vizSettings["graph.dimensions"]?.length === 2 &&
      series.length <= MAX_SERIES
        ? "0.5rem"
        : "1rem",
    isValid: (series, vizSettings) => {
      const dimensions = vizSettings["graph.dimensions"] ?? [];
      if (dimensions.length === 0) {
        const defaultDimensions = getDefaultDimensions(series, vizSettings);
        return defaultDimensions.length === 0;
      } else {
        return getAreDimensionsAndMetricsValid(series, vizSettings);
      }
    },
    getDefault: (series, vizSettings) =>
      getDefaultDimensions(series, vizSettings),
    persistDefault: true,
    getProps: ([{ card, data }], vizSettings) => {
      const addedDimensions = vizSettings["graph.dimensions"];
      const maxDimensionsSupported = getMaxDimensionsSupported(card.display);
      const options = data.cols
        .filter(getDefaultDimensionFilter(card.display))
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
        fieldSettingWidgets: [],
      };
    },
    writeDependencies: ["graph.metrics"],
    eraseDependencies: ["graph.series_order_dimension", "graph.series_order"],
    dashboard: false,
    useRawSeries: true,
  },
  "graph.series_order_dimension": {
    getValue: (_series, settings) => getSeriesOrderDimensionSetting(settings),
    // This read dependency is set so that "graph.series_order" is computed *before* this value, ensuring that
    // that it uses the stored value if one exists. This is needed to check if the dimension has actually changed
    readDependencies: ["graph.series_order"],
  },
  "graph.series_order": {
    section: t`Data`,
    widget: ChartSettingSeriesOrder,
    marginBottom: "1rem",
    useRawSeries: true,
    getValue: (rawSeries, settings) => {
      const seriesModels = getSeriesModelsForSettings(rawSeries, settings);
      const seriesKeys = seriesModels.map(s => s.vizSettingsKey);
      return getSeriesOrderVisibilitySettings(settings, seriesKeys);
    },
    getProps: (rawSeries, settings, _onChange, _extra, onChangeSettings) => {
      const groupedAfterIndex =
        settings["graph.max_categories_enabled"] &&
        settings["graph.max_categories"] !== 0
          ? settings["graph.max_categories"]
          : Infinity;
      const onOtherColorChange = color =>
        onChangeSettings({ "graph.other_category_color": color });
      return {
        rawSeries,
        settings,
        groupedAfterIndex,
        otherColor: settings["graph.other_category_color"],
        otherSettingWidgetId: "graph.max_categories",
        onOtherColorChange,
        truncateAfter: 10,
      };
    },
    getHidden: (_series, settings, extra) => {
      const seriesCount = extra.transformedSeries?.length ?? 0;
      return (
        settings["graph.dimensions"]?.length < 2 || seriesCount > MAX_SERIES
      );
    },
    dashboard: false,
    readDependencies: [
      "series_settings.colors",
      "series_settings",
      "graph.metrics",
      "graph.dimensions",
      "graph.max_categories",
      "graph.other_category_color",
    ],
    writeDependencies: ["graph.series_order_dimension"],
  },
  "graph.metrics": {
    section: t`Data`,
    title: t`Y-axis`,
    widget: "fields",
    isValid: (series, vizSettings) => {
      const metrics = vizSettings["graph.metrics"] ?? [];
      if (metrics.length === 0) {
        const defaultMetrics = getDefaultMetrics(series, vizSettings);
        return defaultMetrics.length === 0;
      } else {
        return getAreDimensionsAndMetricsValid(series, vizSettings);
      }
    },
    getDefault: (series, vizSettings) => getDefaultMetrics(series, vizSettings),
    persistDefault: true,
    getProps: ([{ card, data }], vizSettings, _onChange, extra) => {
      const options = data.cols
        .filter(getDefaultMetricFilter(card.display))
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
    readDependencies: ["series_settings.colors"],
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
      const seriesDisplays = getSeriesDisplays(series, settings);

      return isStackingValueValid(settings, seriesDisplays);
    },
    getDefault: ([{ card, data }], settings) => {
      return getDefaultStackingValue(settings, card);
    },
    getHidden: (series, settings) => {
      const displays = series.map(single => settings.series(single).display);
      const stackableDisplays = displays.filter(display =>
        STACKABLE_SERIES_DISPLAY_TYPES.has(display),
      );

      return stackableDisplays.length <= 1;
    },
    readDependencies: ["graph.metrics", "graph.dimensions", "series"],
  },
};

export const LEGEND_SETTINGS = {
  "legend.is_reversed": {
    getDefault: (_series, settings) => getDefaultLegendIsReversed(settings),
    hidden: true,
  },
};

export const TOOLTIP_SETTINGS = {
  "graph.tooltip_type": {
    getDefault: ([{ card }]) => {
      const shouldShowComparisonTooltip = !["scatter", "waterfall"].includes(
        card.display,
      );
      return shouldShowComparisonTooltip ? "series_comparison" : "default";
    },
    hidden: true,
  },
  "graph.tooltip_columns": {
    section: t`Display`,
    title: t`Additional tooltip metrics`,
    placeholder: t`Enter metric names`,
    widget: "multiselect",
    useRawSeries: true,
    getValue: getComputedAdditionalColumnsValue,
    getHidden: (rawSeries, vizSettings) => {
      const isAggregatedChart = rawSeries[0].card.display !== "scatter";
      return (
        getAvailableAdditionalColumns(rawSeries, vizSettings, isAggregatedChart)
          .length === 0
      );
    },
    getProps: (rawSeries, vizSettings) => {
      const isAggregatedChart = rawSeries[0].card.display !== "scatter";
      const options = getAvailableAdditionalColumns(
        rawSeries,
        vizSettings,
        isAggregatedChart,
      ).map(col => ({
        label: col.display_name,
        value: getColumnKey(col),
      }));

      return {
        options,
      };
    },
    readDependencies: ["graph.metrics", "graph.dimensions"],
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
    getHidden: (series, vizSettings) => !canHaveDataLabels(series, vizSettings),
    getDefault: getDefaultShowDataLabels,
    inline: true,
    marginBottom: "1rem",
  },
  "graph.label_value_frequency": {
    section: t`Display`,
    title: t`Values to show`,
    widget: "segmentedControl",
    getHidden: (series, vizSettings) => {
      if (!vizSettings["graph.show_values"]) {
        return true;
      }

      const areAllBars = getSeriesDisplays(series, vizSettings).every(
        display => display === "bar",
      );
      if (areAllBars && vizSettings["graph.show_stack_values"] === "series") {
        return true;
      }

      const hasLines = getSeriesDisplays(series, vizSettings).some(
        display => display === "line",
      );
      if (vizSettings["stackable.stack_type"] === "normalized" && !hasLines) {
        return true;
      }

      return !canHaveDataLabels(series, vizSettings);
    },
    props: {
      options: [
        { name: t`Some`, value: "fit" },
        { name: t`All`, value: "all" },
      ],
    },
    getDefault: getDefaultDataLabelsFrequency,
    readDependencies: ["graph.show_values"],
  },
  "graph.show_stack_values": {
    section: t`Display`,
    title: t`Stack values to show`,
    widget: "segmentedControl",
    getHidden: (series, vizSettings) => {
      const hasBars = getSeriesDisplays(series, vizSettings).some(
        display => display === "bar",
      );
      return (
        vizSettings["stackable.stack_type"] !== "stacked" ||
        vizSettings["graph.show_values"] !== true ||
        !hasBars
      );
    },
    isValid: (series, vizSettings) => {
      return isShowStackValuesValid(
        getSeriesDisplays(series, vizSettings),
        vizSettings,
      );
    },
    props: {
      options: [
        { name: t`Total`, value: "total" },
        { name: t`Segments`, value: "series" },
        { name: t`Both`, value: "all" },
      ],
    },
    getDefault: (_series, settings) => getDefaultShowStackValues(settings),
    readDependencies: ["graph.show_values", "stackable.stack_type"],
  },
  "graph.label_value_formatting": {
    section: t`Display`,
    title: t`Auto formatting`,
    widget: "segmentedControl",
    getHidden: (series, vizSettings) => {
      return !canHaveDataLabels(series, vizSettings);
    },
    props: {
      options: [
        { name: t`Auto`, value: "auto" },
        { name: t`Compact`, value: "compact" },
        { name: t`Full`, value: "full" },
      ],
    },
    default: getDefaultDataLabelsFormatting(),
  },
  "graph.max_categories_enabled": {
    hidden: true,
    // temporarily hiding the setting (metabase#50510)
    default: false,
    isValid: () => false,
    readDependencies: ["series_settings"],
  },
  "graph.max_categories": {
    widget: ChartSettingMaxCategories,
    hidden: true,
    // temporarily hiding the setting (metabase#50510)
    default: Number.MAX_SAFE_INTEGER,
    isValid: () => false,
    getProps: ([{ card }], settings) => {
      return {
        isEnabled: settings["graph.max_categories_enabled"],
        aggregationFunction: settings["graph.other_category_aggregation_fn"],
      };
    },
    readDependencies: [
      "graph.max_categories_enabled",
      "graph.other_category_aggregation_fn",
      "series_settings",
    ],
  },
  "graph.other_category_color": {
    default: color("text-light"),
  },
  "graph.other_category_aggregation_fn": {
    hidden: true,
    getDefault: ([{ data }], settings) => {
      const [metricName] = settings["graph.metrics"];
      const metric = data.cols.find(col => col.name === metricName);
      return metric?.aggregation_type ?? "sum";
    },
    readDependencies: ["graph.metrics"],
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
    getProps: (series, vizSettings) => ({
      options: getAvailableXAxisScales(series, vizSettings),
    }),
  },
  "graph.y_axis.scale": {
    section: t`Axes`,
    title: t`Scale`,
    index: 8,
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
    index: 9,
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
  "graph.y_axis.unpin_from_zero": {
    section: t`Axes`,
    group: t`Y-axis`,
    title: t`Unpin from zero`,
    widget: "toggle",
    index: 5,
    inline: true,
    isValid: (series, settings) => {
      const seriesDisplays = getSeriesDisplays(series, settings);
      return isYAxisUnpinFromZeroValid(seriesDisplays, settings);
    },
    getHidden: (series, settings) => {
      const seriesDisplays = getSeriesDisplays(series, settings);
      return !isYAxisUnpinFromZeroValid(seriesDisplays, settings);
    },
    getDefault: series => {
      return getYAxisUnpinFromZeroDefault(series[0].card.display);
    },
    readDependencies: ["series", "graph.y_axis.auto_range"],
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
    index: 6,
    title: t`Min`,
    widget: "number",
    default: 0,
    getHidden: (series, vizSettings) =>
      vizSettings["graph.y_axis.auto_range"] !== false,
  },
  "graph.y_axis.max": {
    section: t`Axes`,
    group: t`Y-axis`,
    index: 7,
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
    getDefault: getDefaultIsAutoSplitEnabled,
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
