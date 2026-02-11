import type { BarSeriesOption, LineSeriesOption } from "echarts/charts";
import type { CallbackDataParams } from "echarts/types/dist/shared";
import type {
  LabelLayoutOptionCallbackParams,
  LabelOption,
  SeriesLabelOption,
} from "echarts/types/src/util/types";
import _ from "underscore";

import { getTextColorForBackground } from "metabase/lib/colors/palette";
import { formatValue } from "metabase/lib/formatting";
import { getObjectValues } from "metabase/lib/objects";
import { isNotNull } from "metabase/lib/types";
import {
  INDEX_KEY,
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import {
  CHART_STYLE,
  LINE_SIZE,
  Z_INDEXES,
} from "metabase/visualizations/echarts/cartesian/constants/style";
import type {
  CartesianChartModel,
  ChartDataDensity,
  ChartDataset,
  ComboChartDataDensity,
  DataKey,
  Datum,
  LabelFormatter,
  NumericAxisScaleTransforms,
  NumericXAxisModel,
  SeriesModel,
  StackModel,
  StackTotalDataKey,
  TimeSeriesXAxisModel,
  XAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { EChartsSeriesOption } from "metabase/visualizations/echarts/cartesian/option/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RowValue, SeriesSettings, XAxisScale } from "metabase-types/api";

import type {
  ChartMeasurements,
  TicksRotation,
} from "../chart-measurements/types";
import {
  isCategoryAxis,
  isNumericAxis,
  isTimeSeriesAxis,
} from "../model/guards";
import {
  getDisplaySeriesSettingsByDataKey,
  getStackTotalValue,
} from "../model/series";
import { getBarSeriesDataLabelKey } from "../model/util";

import { getSeriesYAxisIndex } from "./utils";

const MIN_LABEL_SPACING_PX = 40;

const getBlurLabelStyle = (
  settings: ComputedVisualizationSettings,
  hasMultipleSeries: boolean,
) => ({
  show: settings["graph.show_values"] && !hasMultipleSeries,
  opacity: 1,
});

export const getBarLabelLayout =
  ({
    settings,
    getBarDirection,
    getNegativeBarYOffset,
  }: {
    settings: ComputedVisualizationSettings;
    getBarDirection: (p: LabelLayoutOptionCallbackParams) => RowValue;
    getNegativeBarYOffset: (p: LabelLayoutOptionCallbackParams) => number;
  }): BarSeriesOption["labelLayout"] =>
  (params) => {
    const barDirection = getBarDirection(params);
    if (typeof barDirection !== "number") {
      return {};
    }

    const distance = 5; // https://echarts.apache.org/en/option.html#series-line.label.distance

    return {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
      align: "center",
      dy:
        barDirection >= 0
          ? -CHART_STYLE.seriesLabels.size - distance
          : getNegativeBarYOffset(params) + distance,
    };
  };

export const getBarInsideLabelLayout =
  (
    dataset: ChartDataset,
    settings: ComputedVisualizationSettings,
    seriesDataKey: DataKey,
    ticksRotation?: TicksRotation,
  ): BarSeriesOption["labelLayout"] =>
  (params) => {
    const { dataIndex, rect, labelRect } = params;
    if (dataIndex == null) {
      return {};
    }

    // HACK: On the first render, labelRect values are provided as if the label has not been rotated.
    // If we decide to rotate it here, labelRect will be computed for the already rotated label on the next render.
    // Since we can't determine whether it's the initial render or if labelRect is computed for a rotated label,
    // we need to figure out the actual text width of the label based on the known side of the rectangle, which is the text size.
    const labelTextWidth =
      labelRect.width === CHART_STYLE.seriesLabels.size
        ? labelRect.height
        : labelRect.width;
    const paddedLabelTextWidth =
      CHART_STYLE.seriesLabels.stackedPadding * 2 + labelTextWidth;
    const paddedLabelTextHeight =
      CHART_STYLE.seriesLabels.stackedPadding * 2 +
      CHART_STYLE.seriesLabels.size;

    let canFit = false;
    if (ticksRotation === "horizontal") {
      canFit =
        rect.width > paddedLabelTextWidth &&
        rect.height > paddedLabelTextHeight;
    } else if (ticksRotation === "vertical") {
      canFit =
        rect.height > paddedLabelTextWidth &&
        rect.width > paddedLabelTextHeight;
    }

    if (!canFit) {
      return {
        fontSize: 0,
      };
    }

    const labelValue = dataset[dataIndex][seriesDataKey];
    if (typeof labelValue !== "number") {
      return {};
    }

    return {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
      rotate: ticksRotation === "vertical" ? 90 : 0,
    };
  };

export function getDataLabelFormatter(
  dataKey: DataKey,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  formatter: LabelFormatter,
  chartWidth: number,
  settings?: ComputedVisualizationSettings,
  chartDataDensity?: ChartDataDensity,
  accessor?: (datum: Datum) => RowValue,
) {
  const getShowLabel = getShowLabelFn(
    chartWidth,
    dataKey,
    chartDataDensity,
    settings,
  );

  return (params: CallbackDataParams) => {
    const datum = params.data as Datum;
    const value = accessor != null ? accessor(datum) : datum[dataKey];

    if (!getShowLabel(params) || typeof value !== "number") {
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

  const { averageLabelWidth, totalNumberOfLabels } = chartDataDensity;
  if (totalNumberOfLabels === 0 || averageLabelWidth === 0) {
    return () => true;
  }

  const maxLabelsPerSeries = Math.floor(
    chartWidth / (averageLabelWidth + MIN_LABEL_SPACING_PX),
  );

  if (chartDataDensity.type === "combo") {
    const { seriesDataKeysWithLabels, stackedDisplayWithLabels } =
      chartDataDensity;
    const numOfSeries =
      seriesDataKeysWithLabels.length + stackedDisplayWithLabels.length;

    const avgLabelsPerSeries =
      numOfSeries > 0 ? totalNumberOfLabels / numOfSeries : totalNumberOfLabels;

    if (avgLabelsPerSeries <= maxLabelsPerSeries) {
      return () => true;
    }

    const { selectionFrequency, selectionOffset } = getSelectionFrequency(
      chartDataDensity,
      maxLabelsPerSeries,
      dataKey,
    );

    return (params: CallbackDataParams) => {
      return (params.dataIndex + selectionOffset) % selectionFrequency === 0;
    };
  } else {
    if (totalNumberOfLabels <= maxLabelsPerSeries) {
      return () => true;
    }

    const { selectionFrequency, selectionOffset } = getSelectionFrequency(
      chartDataDensity,
      maxLabelsPerSeries,
      dataKey,
    );

    return (params: CallbackDataParams) => {
      return (params.dataIndex + selectionOffset) % selectionFrequency === 0;
    };
  }
}

function getSelectionFrequency(
  chartDataDensity: ChartDataDensity,
  maxLabelsPerSeries: number,
  dataKey: DataKey,
) {
  if (chartDataDensity.type === "waterfall") {
    const { totalNumberOfLabels } = chartDataDensity;

    const selectionFrequency = Math.ceil(
      totalNumberOfLabels / maxLabelsPerSeries,
    );

    return { selectionFrequency, selectionOffset: 0 };
  }

  const {
    totalNumberOfLabels,
    seriesDataKeysWithLabels,
    stackedDisplayWithLabels,
  } = chartDataDensity;

  const numOfSeries =
    seriesDataKeysWithLabels.length + stackedDisplayWithLabels.length;

  const avgLabelsPerSeries =
    numOfSeries > 0 ? totalNumberOfLabels / numOfSeries : totalNumberOfLabels;

  const selectionFrequency = Math.ceil(avgLabelsPerSeries / maxLabelsPerSeries);

  const seriesIndex = seriesDataKeysWithLabels.findIndex(
    (seriesDataKey) => seriesDataKey === dataKey,
  );

  const selectionOffset = seriesIndex % selectionFrequency;

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
  position?: LabelOption["position"],
): SeriesLabelOption => {
  const { fontSize } = renderingContext.theme.cartesian.label;

  return {
    show: !!formatter,
    silent: true,
    position,
    opacity: 1,
    fontFamily: renderingContext.fontFamily,
    fontWeight: CHART_STYLE.seriesLabels.weight,
    fontSize,
    color: renderingContext.getColor("text-primary"),
    textBorderColor: renderingContext.getColor("background-primary"),
    textBorderWidth: 3,
    formatter:
      formatter &&
      getDataLabelFormatter(
        seriesModel.dataKey,
        yAxisScaleTransforms,
        formatter,
        chartWidth,
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
  xAxisScale?: XAxisScale,
) => {
  const isBarWidthSensibleToXAxisScale =
    xAxisScale !== "log" && xAxisScale !== "pow";
  if (!isBarWidthSensibleToXAxisScale) {
    return 1;
  }

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
  xAxisScale?: XAxisScale,
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
      xAxisScale,
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

export const buildEChartsStackLabelOptions = (
  seriesModel: SeriesModel,
  formatter: LabelFormatter | undefined,
  originalDataset: ChartDataset,
  renderingContext: RenderingContext,
  settings: ComputedVisualizationSettings,
  stackModel: StackModel | undefined,
): SeriesLabelOption | undefined => {
  if (!formatter) {
    return;
  }

  const showPercentages =
    settings["graph.stack_value_format"] === "percentage" && stackModel != null;

  return {
    silent: true,
    position: "inside",
    opacity: 1,
    show: true,
    fontFamily: renderingContext.fontFamily,
    fontWeight: CHART_STYLE.seriesLabels.weight,
    fontSize: CHART_STYLE.seriesLabels.size,
    color: getTextColorForBackground(
      seriesModel.color,
      renderingContext.getColor,
    ),
    formatter: (params: CallbackDataParams) => {
      const transformedDatum = params.data as Datum;
      const originalIndex = transformedDatum[INDEX_KEY] ?? params.dataIndex;
      const datum = originalDataset[originalIndex];
      const value = datum[seriesModel.dataKey];

      if (typeof value !== "number") {
        return "";
      }

      if (showPercentages && stackModel != null) {
        // Calculate stack total (sum of absolute values of all series in the stack)
        let stackTotal = 0;
        for (const stackDataKey of stackModel.seriesKeys) {
          const seriesValue = datum[stackDataKey];
          if (typeof seriesValue === "number") {
            stackTotal += Math.abs(seriesValue);
          }
        }

        if (stackTotal === 0) {
          return "";
        }

        const percentage = Math.abs(value) / stackTotal;

        // Format as percentage
        const getColumnSettings = settings.column;
        if (!getColumnSettings) {
          return "";
        }
        const columnSettings = getColumnSettings(seriesModel.column);

        return String(
          formatValue(percentage, {
            column: seriesModel.column,
            number_separators: columnSettings?.number_separators,
            number_style: "percent",
            decimals: 0,
          }),
        );
      }

      return formatter(value);
    },
  };
};
function getDataLabelSeriesOption(
  dataKey: DataKey,
  seriesOption: LineSeriesOption | BarSeriesOption,
  settings: ComputedVisualizationSettings,
  formatter: (params: CallbackDataParams) => string,
  position: LabelOption["position"],
  renderingContext: RenderingContext,
  showInBlur = true,
) {
  const stackName = seriesOption.stack;

  const dataLabelSeriesOption = {
    yAxisIndex: seriesOption.yAxisIndex,
    silent: true,
    symbolSize: 0,
    lineStyle: {
      opacity: 0,
    },
    id: `${stackName}_${dataKey}`,
    stack: stackName,
    encode: {
      y: dataKey,
      x: X_AXIS_DATA_KEY,
    },
    label: {
      ...seriesOption.label,
      show: true,
      position,
      formatter,
      fontFamily: renderingContext.fontFamily,
      fontWeight: CHART_STYLE.seriesLabels.weight,
      fontSize: CHART_STYLE.seriesLabels.size,
      color: renderingContext.getColor("text-primary"),
      textBorderColor: renderingContext.getColor("background-primary"),
      textBorderWidth: 3,
    },
    labelLayout: {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
    },
    z: Z_INDEXES.dataLabels,
    blur: {
      label: {
        opacity: 1,
        show: showInBlur,
      },
    },
  };

  if (seriesOption.type === "bar") {
    return { ...dataLabelSeriesOption, type: "bar" as const };
  }

  return { ...dataLabelSeriesOption, type: "line" as const };
}

const buildEChartsBarSeries = (
  dataset: ChartDataset,
  originalDataset: ChartDataset,
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
  stackModel: StackModel | undefined,
): BarSeriesOption | BarSeriesOption[] => {
  const stack = stackName ?? `bar_${seriesModel.dataKey}`;
  const isStacked = settings["stackable.stack_type"] != null;

  const seriesOption: BarSeriesOption = {
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
    z: Z_INDEXES.series,
    yAxisIndex,
    barGap: 0,
    barMinHeight: 1,
    stack,
    barWidth: computeBarWidth(
      xAxisModel,
      chartMeasurements.boundaryWidth,
      barSeriesCount,
      isStacked,
      settings["graph.x_axis.scale"],
    ),
    encode: {
      y: seriesModel.dataKey,
      x: X_AXIS_DATA_KEY,
    },
    label: isStacked
      ? buildEChartsStackLabelOptions(
          seriesModel,
          labelFormatter,
          originalDataset,
          renderingContext,
          settings,
          stackModel,
        )
      : buildEChartsLabelOptions(
          seriesModel,
          yAxisScaleTransforms,
          renderingContext,
          chartWidth,
          labelFormatter,
          settings,
          chartDataDensity,
          ["50%", 0],
        ),
    labelLayout: isStacked
      ? getBarInsideLabelLayout(
          dataset,
          settings,
          seriesModel.dataKey,
          chartMeasurements.stackedBarTicksRotation,
        )
      : getBarLabelLayout({
          settings,
          getNegativeBarYOffset: ({ rect }) => rect.height,
          getBarDirection: ({ dataIndex }) => {
            if (dataIndex == null) {
              return null;
            }
            return dataset[dataIndex][seriesModel.dataKey];
          },
        }),
    itemStyle: {
      color: seriesModel.color,
    },
  };

  if (
    !settings["graph.show_values"] ||
    settings["stackable.stack_type"] != null ||
    labelFormatter == null
  ) {
    return seriesOption;
  }

  const labelOptions: BarSeriesOption[] = ["+" as const, "-" as const].map(
    (sign) => {
      const labelDataKey = getBarSeriesDataLabelKey(seriesModel.dataKey, sign);
      return {
        ...getDataLabelSeriesOption(
          getBarSeriesDataLabelKey(seriesModel.dataKey, sign),
          seriesOption,
          settings,
          getDataLabelFormatter(
            seriesModel.dataKey,
            yAxisScaleTransforms,
            labelFormatter,
            chartWidth,
            settings,
            chartDataDensity,
            (datum) => {
              const value = datum[seriesModel.dataKey];
              const isZero = value === null && datum[labelDataKey] != null;
              return isZero ? 0 : value;
            },
          ),
          ["50%", 0],
          renderingContext,
          false,
        ),
        labelLayout: getBarLabelLayout({
          settings,
          getBarDirection: () => (sign === "+" ? 1 : -1),
          getNegativeBarYOffset: () => 0,
        }),
        type: "bar", // ensure type is bar for typescript
      };
    },
  );

  if (seriesOption?.label != null) {
    seriesOption.label.show = false;
  }
  if (seriesOption?.emphasis != null) {
    seriesOption.emphasis.label = { show: true };
  }

  return [seriesOption, ...labelOptions];
};

const buildEChartsLineAreaSeries = (
  seriesModel: SeriesModel,
  stackName: string | undefined,
  seriesSettings: SeriesSettings,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  settings: ComputedVisualizationSettings,
  yAxisIndex: number,
  hasMultipleSeries: boolean,
  chartDataDensity: ComboChartDataDensity,
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
  const lineWidth = seriesSettings["line.size"]
    ? LINE_SIZE[seriesSettings["line.size"]]
    : LINE_SIZE.M;

  return {
    emphasis: {
      focus: hasMultipleSeries ? "series" : "self",
      itemStyle: {
        color: seriesModel.color,
        opacity: 1,
      },
      areaStyle: {
        opacity: CHART_STYLE.opacity.areaFocused,
      },
    },
    blur: {
      itemStyle: {
        opacity: isSymbolVisible ? blurOpacity : 0,
      },
      lineStyle: {
        opacity: blurOpacity,
      },
      areaStyle: { opacity: CHART_STYLE.opacity.areaBlurred },
    },
    z: Z_INDEXES.lineAreaSeries,
    id: seriesModel.dataKey,
    type: "line",
    lineStyle: {
      color: seriesModel.color,
      type: seriesSettings["line.style"],
      width: lineWidth,
    },
    yAxisIndex,
    showSymbol: true,
    showAllSymbol: true,
    symbolSize: CHART_STYLE.symbolSize,
    smooth: seriesSettings["line.interpolate"] === "cardinal",
    connectNulls: seriesSettings["line.missing"] === "interpolate",
    step:
      seriesSettings["line.interpolate"] === "step-after" ? "end" : undefined,
    stack: stackName,
    areaStyle:
      seriesSettings.display === "area"
        ? {
            opacity: CHART_STYLE.opacity.area,
            color: seriesModel.color,
          }
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
    symbol: "circle", // default is "emptyCircle", but it's filled with white, so we need to handle the fill ourselves for dark mode
    itemStyle: {
      color: renderingContext.getColor("background-primary"),
      borderColor: seriesModel.color,
      borderWidth: lineWidth,
      opacity: isSymbolVisible ? 1 : 0, // Make the symbol invisible to keep it for event trigger for tooltip
    },
  };
};

function getShowSymbol(
  chartDataDensity: ComboChartDataDensity,
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

function getStackedDataLabelFormatter(
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  signKey: StackTotalDataKey,
  stackDataKeys: DataKey[],
  stackName: string | undefined,
  formatter: LabelFormatter,
  chartDataDensity: ComboChartDataDensity,
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
  chartDataDensity: ComboChartDataDensity,
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

  const maxLabelsPerSeries = Math.floor(
    chartWidth / (averageLabelWidth + MIN_LABEL_SPACING_PX),
  );

  const { stackedDisplayWithLabels, seriesDataKeysWithLabels } =
    chartDataDensity;
  const numOfSeries =
    seriesDataKeysWithLabels.length + stackedDisplayWithLabels.length;
  const avgLabelsPerSeries =
    numOfSeries > 0 ? totalNumberOfLabels / numOfSeries : totalNumberOfLabels;

  if (avgLabelsPerSeries <= maxLabelsPerSeries) {
    return () => true;
  }

  const { selectionFrequency, selectionOffset } = getStackedSelectionFrequency(
    chartDataDensity,
    maxLabelsPerSeries,
    stackName,
  );

  return (params: CallbackDataParams) => {
    return (params.dataIndex + selectionOffset) % selectionFrequency === 0;
  };
}

function getStackedSelectionFrequency(
  chartDataDensity: ComboChartDataDensity,
  maxLabelsPerSeries: number,
  stackName: string | undefined,
) {
  const {
    totalNumberOfLabels,
    seriesDataKeysWithLabels,
    stackedDisplayWithLabels,
  } = chartDataDensity;

  const numOfSeries =
    seriesDataKeysWithLabels.length + stackedDisplayWithLabels.length;

  const avgLabelsPerSeries =
    numOfSeries > 0 ? totalNumberOfLabels / numOfSeries : totalNumberOfLabels;

  const selectionFrequency = Math.ceil(avgLabelsPerSeries / maxLabelsPerSeries);

  const stackedIndex = stackedDisplayWithLabels.findIndex(
    (stackDisplay) => stackDisplay === stackName,
  );

  const totalIndex = stackedIndex + seriesDataKeysWithLabels.length;
  const selectionOffset = totalIndex % selectionFrequency;

  return { selectionFrequency, selectionOffset };
}

export const getStackTotalsSeries = (
  chartModel: CartesianChartModel,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  settings: ComputedVisualizationSettings,
  chartWidth: number,
  seriesOptions: (LineSeriesOption | BarSeriesOption)[],
  renderingContext: RenderingContext,
) => {
  const seriesByStackName = _.groupBy(
    seriesOptions.filter((s) => s.stack != null),
    "stack",
  );

  return getObjectValues(seriesByStackName).flatMap((seriesOptions) => {
    const stackDataKeys = seriesOptions // we set string dataKeys as series IDs
      .map((s) => s.id)
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
      getDataLabelSeriesOption(
        POSITIVE_STACK_TOTAL_DATA_KEY,
        firstSeriesInStack,
        settings,
        labelFormatter &&
          getStackedDataLabelFormatter(
            yAxisScaleTransforms,
            POSITIVE_STACK_TOTAL_DATA_KEY,
            stackDataKeys,
            firstSeriesInStack.stack,
            labelFormatter,
            chartModel.dataDensity,
            chartWidth,
            settings,
          ),
        "top",
        renderingContext,
      ),
      getDataLabelSeriesOption(
        NEGATIVE_STACK_TOTAL_DATA_KEY,
        firstSeriesInStack,
        settings,
        labelFormatter &&
          getStackedDataLabelFormatter(
            yAxisScaleTransforms,
            NEGATIVE_STACK_TOTAL_DATA_KEY,
            stackDataKeys,
            firstSeriesInStack.stack,
            labelFormatter,
            chartModel.dataDensity,
            chartWidth,
            settings,
          ),
        "bottom",
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
    (seriesSettings) => seriesSettings.display === "bar",
  ).length;

  const hasMultipleSeries = chartModel.seriesModels.length > 1;

  const series = chartModel.seriesModels
    .filter((seriesModel) => seriesModel.visible)
    .map((seriesModel) => {
      const seriesSettings = seriesSettingsByDataKey[seriesModel.dataKey];
      const yAxisIndex = seriesYAxisIndexByDataKey[seriesModel.dataKey];
      const stackName =
        chartModel.stackModels == null
          ? undefined
          : chartModel.stackModels.find((stackModel) =>
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
        case "bar": {
          const stackModel =
            chartModel.stackModels == null
              ? undefined
              : chartModel.stackModels.find((stackModel) =>
                  stackModel.seriesKeys.includes(seriesModel.dataKey),
                );
          return buildEChartsBarSeries(
            chartModel.transformedDataset,
            chartModel.dataset,
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
            stackModel,
          );
        }
      }
    })
    .flat()
    .filter(isNotNull);

  const hasStackedSeriesTotalLabels =
    settings["graph.show_values"] &&
    settings["stackable.stack_type"] === "stacked" &&
    (settings["graph.show_stack_values"] === "total" ||
      settings["graph.show_stack_values"] === "all");
  if (hasStackedSeriesTotalLabels) {
    series.push(
      ...getStackTotalsSeries(
        chartModel,
        chartModel.yAxisScaleTransforms,
        settings,
        chartWidth,
        series,
        renderingContext,
      ),
    );
  }

  return series;
};
