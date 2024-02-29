import _ from "underscore";
import type { RegisteredSeriesOption } from "echarts";
import type { SeriesLabelOption } from "echarts/types/src/util/types";

import type { CallbackDataParams } from "echarts/types/dist/shared";
import type {
  LabelLayoutOptionCallbackParams,
  SeriesOption,
} from "echarts/types/dist/echarts";
import type {
  SeriesModel,
  CartesianChartModel,
  DataKey,
  StackTotalDataKey,
  ChartDataset,
  Datum,
  XAxisModel,
  TimeSeriesXAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RowValue, SeriesSettings } from "metabase-types/api";
import { isNotNull } from "metabase/lib/types";
import { getMetricDisplayValueGetter } from "metabase/visualizations/echarts/cartesian/model/dataset";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";

import { getObjectValues } from "metabase/lib/objects";
import type {
  ChartMeasurements,
  EChartsSeriesOption,
} from "metabase/visualizations/echarts/cartesian/option/types";
import {
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type { OptionsType } from "metabase/lib/formatting/types";
import { buildEChartsScatterSeries } from "../scatter/series";
import { isTimeSeriesAxis } from "../model/guards";
import { getSeriesYAxisIndex } from "./utils";

export const getBarLabelLayout =
  (
    dataset: ChartDataset,
    settings: ComputedVisualizationSettings,
    seriesDataKey: DataKey,
  ): SeriesOption["labelLayout"] =>
  params => {
    const { dataIndex, rect } = params;
    if (dataIndex == null) {
      return {};
    }

    const labelValue = dataset[dataIndex][seriesDataKey];
    if (typeof labelValue !== "number") {
      return {};
    }

    const barHeight = rect.height;
    const labelOffset =
      barHeight / 2 +
      CHART_STYLE.seriesLabels.size / 2 +
      CHART_STYLE.seriesLabels.offset;
    return {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
      dy: labelValue < 0 ? labelOffset : -labelOffset,
    };
  };

export function getDataLabelFormatter(
  seriesModel: SeriesModel,
  settings: ComputedVisualizationSettings,
  labelDataKey: DataKey,
  renderingContext: RenderingContext,
  formattingOptions: OptionsType = {},
) {
  const valueFormatter = (value: unknown) =>
    renderingContext.formatValue(value, {
      ...(settings.column?.(seriesModel.column) ?? {}),
      jsx: false,
      compact: settings["graph.label_value_formatting"] === "compact",
      ...formattingOptions,
    });

  const valueGetter = getMetricDisplayValueGetter(settings);

  return (params: CallbackDataParams) => {
    const value = (params.data as Datum)[labelDataKey];

    if (value == null) {
      return " ";
    }
    return valueFormatter(valueGetter(value));
  };
}

const getTimeSeriesBarCategoryGap = (
  dataset: ChartDataset,
  xAxisModel: TimeSeriesXAxisModel,
) => {
  // ECharts calculates category width based on the number of values in the dataset. However, for time series,
  // we want category width be based on the computed interval of data and the number of units within the extent.
  // For example, if data consists of only two points 1st and 20th days and the unit is day, then we want
  // the bar category to have the width of the single day on the axis.
  if (dataset.length < xAxisModel.lengthInIntervals + 1) {
    const fullBarGroupWidthPercent =
      dataset.length / (xAxisModel.lengthInIntervals + 1);
    // Assume 20% padding
    const barCategoryGapPercent = 1 - fullBarGroupWidthPercent * 0.8;

    return `${barCategoryGapPercent * 100}%`;
  }

  return undefined;
};

export const buildEChartsLabelOptions = (
  seriesModel: SeriesModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
  show?: boolean,
  position?: "top" | "bottom" | "inside",
): SeriesLabelOption => {
  return {
    silent: true,
    show,
    position,
    fontFamily: renderingContext.fontFamily,
    fontWeight: CHART_STYLE.seriesLabels.weight,
    fontSize: CHART_STYLE.seriesLabels.size,
    color: renderingContext.getColor("text-dark"),
    textBorderColor: renderingContext.getColor("white"),
    textBorderWidth: 3,
    formatter: getDataLabelFormatter(
      seriesModel,
      settings,
      seriesModel.dataKey,
      renderingContext,
    ),
  };
};

const buildEChartsBarSeries = (
  dataset: ChartDataset,
  xAxisModel: XAxisModel,
  seriesModel: SeriesModel,
  settings: ComputedVisualizationSettings,
  yAxisIndex: number,
  barSeriesCount: number,
  hasMultipleSeries: boolean,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["bar"] => {
  const stackName =
    settings["stackable.stack_type"] != null ? `bar_${yAxisIndex}` : undefined;

  const isHistogram = settings["graph.x_axis.scale"] === "histogram";
  const stackedOrSingleSeries = stackName !== undefined || barSeriesCount === 1;

  let barWidth: string | number | undefined = undefined;
  let barCategoryGap: string | number | undefined = undefined;

  if (isHistogram) {
    if (stackedOrSingleSeries) {
      barWidth = "99.5%"; // a tiny gap looks better than 100%
    } else {
      barWidth = `${99.5 / barSeriesCount}%`;
    }
  } else if (isTimeSeriesAxis(xAxisModel)) {
    barCategoryGap = getTimeSeriesBarCategoryGap(dataset, xAxisModel);
  }

  return {
    id: seriesModel.dataKey,
    emphasis: {
      focus: hasMultipleSeries ? "series" : "self",
      itemStyle: {
        color: seriesModel.color,
      },
    },
    blur: {
      label: {
        show: settings["graph.show_values"] && !hasMultipleSeries,
      },
      itemStyle: {
        opacity: CHART_STYLE.opacity.blur,
      },
    },
    type: "bar",
    z: CHART_STYLE.series.zIndex,
    yAxisIndex,
    barGap: 0,
    stack: stackName,
    barCategoryGap,
    barWidth,
    encode: {
      y: seriesModel.dataKey,
      x: X_AXIS_DATA_KEY,
    },
    label: buildEChartsLabelOptions(
      seriesModel,
      settings,
      renderingContext,
      settings["graph.show_values"] && settings["stackable.stack_type"] == null,
    ),
    labelLayout: getBarLabelLayout(dataset, settings, seriesModel.dataKey),
    itemStyle: {
      color: seriesModel.color,
    },
  };
};

function getShowSymbol(
  seriesModel: SeriesModel,
  seriesSettings: SeriesSettings,
  dataset: ChartDataset,
  chartWidth: number,
) {
  // "line.marker_enabled" corresponds to the "Show dots on lines" series setting
  // and can be true, false, or undefined
  // true = on
  // false = off
  // undefined = auto
  const isAuto = seriesSettings["line.marker_enabled"] == null;
  if (!isAuto) {
    return seriesSettings["line.marker_enabled"];
  }
  if (chartWidth <= 0) {
    return false;
  }
  const numDots =
    seriesSettings["line.missing"] !== "none"
      ? dataset.length
      : dataset.filter(datum => datum[seriesModel.dataKey] != null).length;

  // symbolSize is the dot's diameter
  return chartWidth / numDots > CHART_STYLE.symbolSize;
}

const buildEChartsLineAreaSeries = (
  seriesModel: SeriesModel,
  seriesSettings: SeriesSettings,
  dataset: ChartDataset,
  settings: ComputedVisualizationSettings,
  yAxisIndex: number,
  hasMultipleSeries: boolean,
  chartWidth: number,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["line"] => {
  const display = seriesSettings?.display ?? "line";

  const stackName =
    settings["stackable.stack_type"] != null ? `area_${yAxisIndex}` : undefined;

  const isSymbolVisible = getShowSymbol(
    seriesModel,
    seriesSettings,
    dataset,
    chartWidth,
  );

  const blurOpacity = hasMultipleSeries ? CHART_STYLE.opacity.blur : 1;

  return {
    emphasis: {
      focus: hasMultipleSeries ? "series" : "self",
      itemStyle: {
        color: seriesModel.color,
      },
    },
    blur: {
      label: {
        show: settings["graph.show_values"] && !hasMultipleSeries,
      },
      itemStyle: {
        opacity: isSymbolVisible ? blurOpacity : 0,
      },
      lineStyle: {
        opacity: blurOpacity,
      },
    },
    z: CHART_STYLE.series.zIndex,
    id: seriesModel.dataKey,
    type: "line",
    yAxisIndex,
    showSymbol: true,
    symbolSize: CHART_STYLE.symbolSize,
    smooth: seriesSettings["line.interpolate"] === "cardinal",
    connectNulls: seriesSettings["line.missing"] === "interpolate",
    step:
      seriesSettings["line.interpolate"] === "step-after" ? "end" : undefined,
    stack: stackName,
    areaStyle:
      display === "area" ? { opacity: CHART_STYLE.opacity.area } : undefined,
    encode: {
      y: seriesModel.dataKey,
      x: X_AXIS_DATA_KEY,
    },
    label: buildEChartsLabelOptions(
      seriesModel,
      settings,
      renderingContext,
      settings["graph.show_values"] && stackName == null,
      "top",
    ),
    labelLayout: {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
    },
    itemStyle: {
      color: seriesModel.color,
      opacity: isSymbolVisible ? 1 : 0, // Make the symbol invisible to keep it for event trigger for tooltip
    },
  };
};

const generateStackOption = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  signKey: StackTotalDataKey,
  stackDataKeys: DataKey[],
  seriesOptionFromStack: EChartsSeriesOption,
  renderingContext: RenderingContext,
) => {
  const seriesModel = chartModel.seriesModels.find(
    s => s.dataKey === stackDataKeys[0],
  );

  if (!seriesModel) {
    return null;
  }

  const stackName = seriesOptionFromStack.stack;

  return {
    yAxisIndex: seriesOptionFromStack.yAxisIndex,
    silent: true,
    symbolSize: 0,
    lineStyle: {
      opacity: 0,
    },
    type: seriesOptionFromStack.type,
    id: `${stackName}_${signKey}`,
    stack: stackName,
    encode: {
      y: signKey,
      x: X_AXIS_DATA_KEY,
    },
    label: {
      ...seriesOptionFromStack.label,
      position: signKey === POSITIVE_STACK_TOTAL_DATA_KEY ? "top" : "bottom",
      show: true,
      formatter: (
        params: LabelLayoutOptionCallbackParams & { data: Datum },
      ) => {
        let stackValue: number | null = null;
        stackDataKeys.forEach(stackDataKeys => {
          const seriesValue = params.data[stackDataKeys];
          if (
            typeof seriesValue === "number" &&
            ((signKey === POSITIVE_STACK_TOTAL_DATA_KEY && seriesValue > 0) ||
              (signKey === NEGATIVE_STACK_TOTAL_DATA_KEY && seriesValue < 0))
          ) {
            stackValue = (stackValue ?? 0) + seriesValue;
          }
        });

        if (stackValue === null) {
          return " ";
        }

        const valueGetter = getMetricDisplayValueGetter(settings);
        const valueFormatter = (value: RowValue) =>
          renderingContext.formatValue(valueGetter(value), {
            ...(settings.column?.(seriesModel.column) ?? {}),
            jsx: false,
            compact: settings["graph.label_value_formatting"] === "compact",
          });

        return valueFormatter(stackValue);
      },
    },
    labelLayout: {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
    },
    z: CHART_STYLE.series.zIndex,
  };
};

export const getStackTotalsSeries = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  seriesOptions: EChartsSeriesOption[],
  renderingContext: RenderingContext,
) => {
  const seriesByStackName = _.groupBy(
    seriesOptions.filter(s => s.stack != null),
    "stack",
  );

  return getObjectValues(seriesByStackName).flatMap(seriesOptions => {
    const stackDataKeys = seriesOptions // we set string dataKeys as series IDs
      .map(s => s.id)
      .filter(isNotNull) as string[];
    const firstSeriesInStack = seriesOptions[0];

    return [
      generateStackOption(
        chartModel,
        settings,
        POSITIVE_STACK_TOTAL_DATA_KEY,
        stackDataKeys,
        firstSeriesInStack,
        renderingContext,
      ),
      generateStackOption(
        chartModel,
        settings,
        NEGATIVE_STACK_TOTAL_DATA_KEY,
        stackDataKeys,
        firstSeriesInStack,
        renderingContext,
      ),
    ];
  });
};

export const buildEChartsSeries = (
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  chartWidth: number,
  chartMeasurements: ChartMeasurements,
  renderingContext: RenderingContext,
): EChartsSeriesOption[] => {
  const seriesSettingsByDataKey = chartModel.seriesModels.reduce(
    (acc, seriesModel) => {
      acc[seriesModel.dataKey] = settings.series(
        seriesModel.legacySeriesSettingsObjectKey,
      );
      return acc;
    },
    {} as Record<DataKey, SeriesSettings>,
  );

  const barSeriesCount = Object.values(seriesSettingsByDataKey).filter(
    seriesSettings => seriesSettings.display === "bar",
  ).length;

  const hasMultipleSeries = chartModel.seriesModels.length > 1;

  const series = chartModel.seriesModels
    .map(seriesModel => {
      const seriesSettings = seriesSettingsByDataKey[seriesModel.dataKey];
      const yAxisIndex = getSeriesYAxisIndex(seriesModel, chartModel);

      switch (seriesSettings.display) {
        case "line":
        case "area":
          return buildEChartsLineAreaSeries(
            seriesModel,
            seriesSettings,
            chartModel.dataset,
            settings,
            yAxisIndex,
            hasMultipleSeries,
            chartWidth,
            renderingContext,
          );
        case "bar":
          return buildEChartsBarSeries(
            chartModel.transformedDataset,
            chartModel.xAxisModel,
            seriesModel,
            settings,
            yAxisIndex,
            barSeriesCount,
            hasMultipleSeries,
            renderingContext,
          );
        case "scatter":
          return buildEChartsScatterSeries(
            seriesModel,
            chartModel.bubbleSizeDomain,
            yAxisIndex,
            renderingContext,
          );
      }
    })
    .flat()
    .filter(isNotNull);

  if (settings["stackable.stack_type"] != null) {
    series.reverse(); // stacks the series from stop to bottom to match legend and sidebar #28772
  }

  if (
    settings["stackable.stack_type"] === "stacked" &&
    settings["graph.show_values"]
  ) {
    series.push(
      // @ts-expect-error TODO: figure out ECharts series option types
      ...getStackTotalsSeries(chartModel, settings, series, renderingContext),
    );
  }

  // @ts-expect-error TODO: figure out ECharts series option types
  return series;
};
