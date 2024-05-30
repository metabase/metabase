import type { BarSeriesOption, LineSeriesOption } from "echarts/charts";
import type { CallbackDataParams } from "echarts/types/dist/shared";
import type { SeriesLabelOption } from "echarts/types/src/util/types";
import _ from "underscore";

import { getObjectValues } from "metabase/lib/objects";
import { isNotNull } from "metabase/lib/types";
import {
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import {
  CHART_STYLE,
  LINE_SIZE,
} from "metabase/visualizations/echarts/cartesian/constants/style";
import type {
  SeriesModel,
  DataKey,
  StackTotalDataKey,
  ChartDataset,
  Datum,
  XAxisModel,
  TimeSeriesXAxisModel,
  NumericXAxisModel,
  NumericAxisScaleTransforms,
  LabelFormatter,
  ChartDataDensity,
  CartesianChartModel,
  CartesianChartDataDensity,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { EChartsSeriesOption } from "metabase/visualizations/echarts/cartesian/option/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { SeriesSettings } from "metabase-types/api";

import type { ChartMeasurements } from "../chart-measurements/types";
import {
  isCategoryAxis,
  isNumericAxis,
  isTimeSeriesAxis,
} from "../model/guards";
import {
  getDisplaySeriesSettingsByDataKey,
  getStackTotalValue,
} from "../model/series";

import { getSeriesYAxisIndex } from "./utils";

const CARTESIAN_LABEL_DENSITY_SCALE_FACTOR = 1.2;
const WATERFALL_LABEL_DENSITY_SCALE_FACTOR = 0.6;

const getBlurLabelStyle = (
  settings: ComputedVisualizationSettings,
  hasMultipleSeries: boolean,
) => ({
  show: settings["graph.show_values"] && !hasMultipleSeries,
  opacity: 1,
});

export const getBarLabelLayout =
  (
    dataset: ChartDataset,
    settings: ComputedVisualizationSettings,
    seriesDataKey: DataKey,
  ): BarSeriesOption["labelLayout"] =>
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
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  formatter: LabelFormatter,
  chartWidth: number,
  labelDataKey?: DataKey,
  settings?: ComputedVisualizationSettings,
  chartDataDensity?: ChartDataDensity,
) {
  const accessKey = labelDataKey ?? seriesModel.dataKey;

  const getShowLabel = getShowLabelFn(
    chartWidth,
    accessKey,
    chartDataDensity,
    settings,
  );

  return (params: CallbackDataParams) => {
    const value = (params.data as Datum)[accessKey];

    if (!getShowLabel(params)) {
      return "";
    }

    if (typeof value !== "number") {
      return "";
    }

    return formatter(yAxisScaleTransforms.fromEChartsAxisValue(value));
  };
}

function getShowLabelFn(
  chartWidth: number,
  dataKey: DataKey,
  chartDataDensity?: ChartDataDensity,
  settings?: ComputedVisualizationSettings,
): (params: CallbackDataParams) => boolean {
  if (!settings || !chartDataDensity) {
    return () => true;
  }
  if (settings["graph.label_value_frequency"] === "all") {
    return () => true;
  }

  const { averageLabelWidth, totalNumberOfLabels, type } = chartDataDensity;
  if (totalNumberOfLabels === 0 || averageLabelWidth === 0) {
    return () => true;
  }

  const scaleFactor =
    type === "cartesian"
      ? CARTESIAN_LABEL_DENSITY_SCALE_FACTOR
      : WATERFALL_LABEL_DENSITY_SCALE_FACTOR;
  const maxNumberOfLabels = (scaleFactor * chartWidth) / averageLabelWidth;
  if (totalNumberOfLabels <= maxNumberOfLabels) {
    return () => true;
  }

  const { selectionFrequency, selectionOffset } = getSelectionFrequency(
    chartDataDensity,
    maxNumberOfLabels,
    dataKey,
  );

  return (params: CallbackDataParams) => {
    return (params.dataIndex + selectionOffset) % selectionFrequency === 0;
  };
}

function getSelectionFrequency(
  chartDataDensity: ChartDataDensity,
  maxNumberOfLabels: number,
  dataKey: DataKey,
) {
  if (chartDataDensity.type === "waterfall") {
    const { totalNumberOfLabels } = chartDataDensity;

    const selectionFrequency = Math.ceil(
      totalNumberOfLabels / maxNumberOfLabels,
    );

    return { selectionFrequency, selectionOffset: 0 };
  }

  const {
    totalNumberOfLabels,
    seriesDataKeysWithLabels,
    stackedDisplayWithLabels,
  } = chartDataDensity;

  const selectionFrequency = Math.ceil(totalNumberOfLabels / maxNumberOfLabels);

  const numOfDifferentSeriesWithLabels =
    seriesDataKeysWithLabels.length + stackedDisplayWithLabels.length;
  const stepOffset = Math.floor(
    selectionFrequency / numOfDifferentSeriesWithLabels,
  );

  const seriesIndex = _.findIndex(
    seriesDataKeysWithLabels,
    seriesDataKey => seriesDataKey === dataKey,
  );
  const selectionOffset = seriesIndex * stepOffset;

  return { selectionFrequency, selectionOffset };
}

export const buildEChartsLabelOptions = (
  seriesModel: SeriesModel,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  renderingContext: RenderingContext,
  chartWidth: number,
  formatter?: LabelFormatter,
  settings?: ComputedVisualizationSettings,
  chartDataDensity?: ChartDataDensity,
  position?: "top" | "bottom" | "inside",
): SeriesLabelOption => {
  return {
    silent: true,
    show: !!formatter,
    position,
    opacity: 1,
    fontFamily: renderingContext.fontFamily,
    fontWeight: CHART_STYLE.seriesLabels.weight,
    fontSize: CHART_STYLE.seriesLabels.size,
    color: renderingContext.getColor("text-dark"),
    textBorderColor: renderingContext.getColor("white"),
    textBorderWidth: 3,
    formatter:
      formatter &&
      getDataLabelFormatter(
        seriesModel,
        yAxisScaleTransforms,
        formatter,
        chartWidth,
        undefined,
        settings,
        chartDataDensity,
      ),
  };
};

export const computeContinuousScaleBarWidth = (
  xAxisModel: TimeSeriesXAxisModel | NumericXAxisModel,
  boundaryWidth: number,
  barSeriesCount: number,
  stackedOrSingleSeries: boolean,
) => {
  let barWidth =
    (boundaryWidth / (xAxisModel.intervalsCount + 2)) *
    CHART_STYLE.series.barWidth;

  if (!stackedOrSingleSeries) {
    barWidth /= barSeriesCount;
  }

  return barWidth;
};

export const computeBarWidth = (
  xAxisModel: XAxisModel,
  boundaryWidth: number,
  barSeriesCount: number,
  isStacked: boolean,
) => {
  const stackedOrSingleSeries = isStacked || barSeriesCount === 1;
  const isNumericOrTimeSeries =
    isNumericAxis(xAxisModel) || isTimeSeriesAxis(xAxisModel);

  if (isNumericOrTimeSeries) {
    return computeContinuousScaleBarWidth(
      xAxisModel,
      boundaryWidth,
      barSeriesCount,
      stackedOrSingleSeries,
    );
  }

  let barWidth: string | number | undefined = undefined;

  if (isCategoryAxis(xAxisModel) && xAxisModel.isHistogram) {
    const barWidthPercent = stackedOrSingleSeries
      ? CHART_STYLE.series.histogramBarWidth
      : CHART_STYLE.series.histogramBarWidth / barSeriesCount;
    barWidth = `${barWidthPercent * 100}%`;
  }

  return barWidth;
};

const buildEChartsBarSeries = (
  dataset: ChartDataset,
  xAxisModel: XAxisModel,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  chartMeasurements: ChartMeasurements,
  seriesModel: SeriesModel,
  stackName: string | undefined,
  settings: ComputedVisualizationSettings,
  yAxisIndex: number,
  barSeriesCount: number,
  hasMultipleSeries: boolean,
  chartDataDensity: ChartDataDensity,
  chartWidth: number,
  labelFormatter: LabelFormatter | undefined,
  renderingContext: RenderingContext,
): BarSeriesOption => {
  return {
    id: seriesModel.dataKey,
    emphasis: {
      focus: hasMultipleSeries ? "series" : "self",
      itemStyle: {
        color: seriesModel.color,
      },
    },
    blur: {
      label: getBlurLabelStyle(settings, hasMultipleSeries),
      itemStyle: {
        opacity: CHART_STYLE.opacity.blur,
      },
    },
    type: "bar",
    z: CHART_STYLE.series.zIndex,
    yAxisIndex,
    barGap: 0,
    stack: stackName,
    barWidth: computeBarWidth(
      xAxisModel,
      chartMeasurements.boundaryWidth,
      barSeriesCount,
      !!stackName,
    ),
    encode: {
      y: seriesModel.dataKey,
      x: X_AXIS_DATA_KEY,
    },
    label: buildEChartsLabelOptions(
      seriesModel,
      yAxisScaleTransforms,
      renderingContext,
      chartWidth,
      labelFormatter,
      settings,
      chartDataDensity,
    ),
    labelLayout: getBarLabelLayout(dataset, settings, seriesModel.dataKey),
    itemStyle: {
      color: seriesModel.color,
    },
  };
};

const buildEChartsLineAreaSeries = (
  seriesModel: SeriesModel,
  stackName: string | undefined,
  seriesSettings: SeriesSettings,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  settings: ComputedVisualizationSettings,
  yAxisIndex: number,
  hasMultipleSeries: boolean,
  chartDataDensity: CartesianChartDataDensity,
  chartWidth: number,
  labelFormatter: LabelFormatter | undefined,
  renderingContext: RenderingContext,
): LineSeriesOption => {
  const isSymbolVisible = getShowSymbol(
    chartDataDensity,
    chartWidth,
    seriesSettings,
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
      label: getBlurLabelStyle(settings, hasMultipleSeries),
      itemStyle: {
        opacity: isSymbolVisible ? blurOpacity : 0,
      },
      lineStyle: {
        opacity: blurOpacity,
      },
      areaStyle: { opacity: CHART_STYLE.opacity.area },
    },
    z: CHART_STYLE.series.zIndexLineArea,
    id: seriesModel.dataKey,
    type: "line",
    lineStyle: {
      type: seriesSettings["line.style"],
      width: seriesSettings["line.size"]
        ? LINE_SIZE[seriesSettings["line.size"]]
        : LINE_SIZE.M,
    },
    yAxisIndex,
    showSymbol: true,
    symbolSize: CHART_STYLE.symbolSize,
    smooth: seriesSettings["line.interpolate"] === "cardinal",
    connectNulls: seriesSettings["line.missing"] === "interpolate",
    step:
      seriesSettings["line.interpolate"] === "step-after" ? "end" : undefined,
    stack: stackName,
    areaStyle:
      seriesSettings.display === "area"
        ? { opacity: CHART_STYLE.opacity.area }
        : undefined,
    encode: {
      y: seriesModel.dataKey,
      x: X_AXIS_DATA_KEY,
    },
    label: buildEChartsLabelOptions(
      seriesModel,
      yAxisScaleTransforms,
      renderingContext,
      chartWidth,
      labelFormatter,
      settings,
      chartDataDensity,
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

function getShowSymbol(
  chartDataDensity: CartesianChartDataDensity,
  chartWidth: number,
  seriesSettings: SeriesSettings,
): boolean {
  const { totalNumberOfDots } = chartDataDensity;
  const maxNumberOfDots = chartWidth / (2 * CHART_STYLE.symbolSize);

  if (chartWidth <= 0) {
    return false;
  }

  if (seriesSettings["line.marker_enabled"] === false) {
    return false;
  }

  if (seriesSettings["line.marker_enabled"] === true) {
    return true;
  }

  return totalNumberOfDots <= maxNumberOfDots;
}

const generateStackOption = (
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  settings: ComputedVisualizationSettings,
  signKey: StackTotalDataKey,
  stackDataKeys: DataKey[],
  seriesOptionFromStack: LineSeriesOption | BarSeriesOption,
  labelFormatter: LabelFormatter | undefined,
  chartDataDensity: CartesianChartDataDensity,
  chartWidth: number,
) => {
  const stackName = seriesOptionFromStack.stack;

  const seriesOption = {
    yAxisIndex: seriesOptionFromStack.yAxisIndex,
    silent: true,
    symbolSize: 0,
    lineStyle: {
      opacity: 0,
    },
    id: `${stackName}_${signKey}`,
    stack: stackName,
    encode: {
      y: signKey,
      x: X_AXIS_DATA_KEY,
    },
    label: {
      ...seriesOptionFromStack.label,
      show: true,
      position:
        signKey === POSITIVE_STACK_TOTAL_DATA_KEY
          ? ("top" as const)
          : ("bottom" as const),
      formatter:
        labelFormatter &&
        getStackedDataLabelFormatter(
          yAxisScaleTransforms,
          signKey,
          stackDataKeys,
          stackName,
          labelFormatter,
          chartDataDensity,
          chartWidth,
          settings,
        ),
    },
    labelLayout: {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
    },
    z: CHART_STYLE.seriesLabels.zIndex,
    blur: {
      label: {
        opacity: 1,
      },
    },
  };

  if (seriesOptionFromStack.type === "bar") {
    return { ...seriesOption, type: "bar" as const };
  }

  return { ...seriesOption, type: "line" as const };
};

function getStackedDataLabelFormatter(
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  signKey: StackTotalDataKey,
  stackDataKeys: DataKey[],
  stackName: string | undefined,
  formatter: LabelFormatter,
  chartDataDensity: CartesianChartDataDensity,
  chartWidth: number,
  settings: ComputedVisualizationSettings,
) {
  const getShowStackedLabel = getShowStackedLabelFn(
    chartWidth,
    stackName,
    chartDataDensity,
    settings,
  );

  return (params: CallbackDataParams) => {
    if (!getShowStackedLabel(params)) {
      return "";
    }

    const stackValue = getStackTotalValue(
      params.data as Datum,
      stackDataKeys,
      signKey,
    );

    if (stackValue === null) {
      return "";
    }

    return formatter(yAxisScaleTransforms.fromEChartsAxisValue(stackValue));
  };
}

function getShowStackedLabelFn(
  chartWidth: number,
  stackName: string | undefined,
  chartDataDensity: CartesianChartDataDensity,
  settings: ComputedVisualizationSettings,
): (params: CallbackDataParams) => boolean {
  if (!settings || !chartDataDensity) {
    return () => true;
  }
  if (settings["graph.label_value_frequency"] === "all") {
    return () => true;
  }

  const { averageLabelWidth, totalNumberOfLabels } = chartDataDensity;
  if (totalNumberOfLabels === 0 || averageLabelWidth === 0) {
    return () => true;
  }

  const scaleFactor = CARTESIAN_LABEL_DENSITY_SCALE_FACTOR;
  const maxNumberOfLabels = (scaleFactor * chartWidth) / averageLabelWidth;
  if (totalNumberOfLabels <= maxNumberOfLabels) {
    return () => true;
  }

  const { selectionFrequency, selectionOffset } = getStackedSelectionFrequency(
    chartDataDensity,
    maxNumberOfLabels,
    stackName,
  );

  return (params: CallbackDataParams) => {
    return (params.dataIndex + selectionOffset) % selectionFrequency === 0;
  };
}

function getStackedSelectionFrequency(
  chartDataDensity: CartesianChartDataDensity,
  maxNumberOfLabels: number,
  stackName: string | undefined,
) {
  const {
    totalNumberOfLabels,
    seriesDataKeysWithLabels,
    stackedDisplayWithLabels,
  } = chartDataDensity;

  const selectionFrequency = Math.ceil(totalNumberOfLabels / maxNumberOfLabels);

  const numOfDifferentSeriesWithLabels =
    seriesDataKeysWithLabels.length + stackedDisplayWithLabels.length;
  const stepOffset = Math.floor(
    selectionFrequency / numOfDifferentSeriesWithLabels,
  );

  const stackedIndex = _.findIndex(
    stackedDisplayWithLabels,
    stackDisplay => stackDisplay === stackName,
  );
  const selectionOffset =
    (stackedIndex + seriesDataKeysWithLabels.length) * stepOffset;

  return { selectionFrequency, selectionOffset };
}

export const getStackTotalsSeries = (
  chartModel: CartesianChartModel,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  settings: ComputedVisualizationSettings,
  chartWidth: number,
  seriesOptions: (LineSeriesOption | BarSeriesOption)[],
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

    const labelFormatter = firstSeriesInStack.stack
      ? chartModel.stackedLabelsFormatters?.[
          firstSeriesInStack.stack as "bar" | "area"
        ]
      : undefined;

    if (!labelFormatter) {
      return [];
    }

    return [
      generateStackOption(
        yAxisScaleTransforms,
        settings,
        POSITIVE_STACK_TOTAL_DATA_KEY,
        stackDataKeys,
        firstSeriesInStack,
        labelFormatter,
        chartModel.dataDensity,
        chartWidth,
      ),
      generateStackOption(
        yAxisScaleTransforms,
        settings,
        NEGATIVE_STACK_TOTAL_DATA_KEY,
        stackDataKeys,
        firstSeriesInStack,
        labelFormatter,
        chartModel.dataDensity,
        chartWidth,
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
  const seriesSettingsByDataKey = getDisplaySeriesSettingsByDataKey(
    chartModel.seriesModels,
    chartModel.stackModels,
    settings,
  );

  const seriesYAxisIndexByDataKey = chartModel.seriesModels.reduce(
    (acc, seriesModel) => {
      acc[seriesModel.dataKey] = getSeriesYAxisIndex(
        seriesModel.dataKey,
        chartModel,
      );
      return acc;
    },
    {} as Record<DataKey, number>,
  );

  const barSeriesCount = Object.values(seriesSettingsByDataKey).filter(
    seriesSettings => seriesSettings.display === "bar",
  ).length;

  const hasMultipleSeries = chartModel.seriesModels.length > 1;

  const series = chartModel.seriesModels
    .map(seriesModel => {
      const seriesSettings = seriesSettingsByDataKey[seriesModel.dataKey];
      const yAxisIndex = seriesYAxisIndexByDataKey[seriesModel.dataKey];
      const stackName =
        chartModel.stackModels == null
          ? undefined
          : chartModel.stackModels.find(stackModel =>
              stackModel.seriesKeys.includes(seriesModel.dataKey),
            )?.display;

      switch (seriesSettings.display) {
        case "line":
        case "area":
          return buildEChartsLineAreaSeries(
            seriesModel,
            stackName,
            seriesSettings,
            chartModel.yAxisScaleTransforms,
            settings,
            yAxisIndex,
            hasMultipleSeries,
            chartModel.dataDensity,
            chartWidth,
            chartModel.seriesLabelsFormatters?.[seriesModel.dataKey],
            renderingContext,
          );
        case "bar":
          return buildEChartsBarSeries(
            chartModel.transformedDataset,
            chartModel.xAxisModel,
            chartModel.yAxisScaleTransforms,
            chartMeasurements,
            seriesModel,
            stackName,
            settings,
            yAxisIndex,
            barSeriesCount,
            hasMultipleSeries,
            chartModel.dataDensity,
            chartWidth,
            chartModel.seriesLabelsFormatters?.[seriesModel.dataKey],
            renderingContext,
          );
      }
    })
    .flat()
    .filter(isNotNull);

  if (
    settings["stackable.stack_type"] === "stacked" &&
    settings["graph.show_values"]
  ) {
    series.push(
      ...getStackTotalsSeries(
        chartModel,
        chartModel.yAxisScaleTransforms,
        settings,
        chartWidth,
        series,
      ),
    );
  }

  return series;
};
