import type { RegisteredSeriesOption } from "echarts";
import type {
  LabelLayoutOptionCallbackParams,
  SeriesOption,
} from "echarts/types/dist/echarts";
import type { CallbackDataParams } from "echarts/types/dist/shared";
import type { SeriesLabelOption } from "echarts/types/src/util/types";
import _ from "underscore";

import type { OptionsType } from "metabase/lib/formatting/types";
import { getObjectValues } from "metabase/lib/objects";
import { isNotNull } from "metabase/lib/types";
import {
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import type {
  SeriesModel,
  CartesianChartModel,
  DataKey,
  StackTotalDataKey,
  ChartDataset,
  Datum,
  XAxisModel,
  TimeSeriesXAxisModel,
  NumericXAxisModel,
  NumericAxisScaleTransforms,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { EChartsSeriesOption } from "metabase/visualizations/echarts/cartesian/option/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RowValue, SeriesSettings } from "metabase-types/api";

import type { ChartMeasurements } from "../chart-measurements/types";
import {
  isCategoryAxis,
  isNumericAxis,
  isTimeSeriesAxis,
} from "../model/guards";
import { buildEChartsScatterSeries } from "../scatter/series";

import { getSeriesYAxisIndex } from "./utils";

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
  dataset: ChartDataset,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  settings: ComputedVisualizationSettings,
  labelDataKey: DataKey,
  renderingContext: RenderingContext,
  formattingOptions: OptionsType = {},
) {
  const isCompact = shouldRenderCompact({
    dataset,
    getValue: (datum: Datum) => datum[labelDataKey],
    formattingOptions,
    renderingContext,
    seriesModel,
    settings,
  });
  const valueFormatter = (value: RowValue) =>
    renderingContext.formatValue(value, {
      ...(settings.column?.(seriesModel.column) ?? {}),
      jsx: false,
      compact: isCompact,
      ...formattingOptions,
    });

  return (params: CallbackDataParams) => {
    const value = (params.data as Datum)[labelDataKey];

    if (typeof value !== "number") {
      return " ";
    }
    return valueFormatter(yAxisScaleTransforms.fromEChartsAxisValue(value));
  };
}

function shouldRenderCompact({
  dataset,
  getValue,
  formattingOptions = {},
  renderingContext,
  seriesModel,
  settings,
}: {
  dataset: ChartDataset;
  getValue: (datum: Datum) => RowValue;
  formattingOptions?: OptionsType;
  renderingContext: RenderingContext;
  seriesModel: SeriesModel;
  settings: ComputedVisualizationSettings;
}) {
  if (settings["graph.label_value_formatting"] === "compact") {
    return true;
  }
  if (settings["graph.label_value_formatting"] === "full") {
    return false;
  }
  // for "auto" we use compact if it shortens avg label length by >3 chars
  const getAvgLength = (compact: boolean) => {
    const lengths = dataset.map(datum => {
      const value = getValue(datum);
      return renderingContext.formatValue(value, {
        ...(settings.column?.(seriesModel.column) ?? {}),
        jsx: false,
        compact: compact,
        ...formattingOptions,
      }).length;
    });

    return (
      lengths.reduce((sum: number, length: number) => sum + length, 0) /
      lengths.length
    );
  };

  return getAvgLength(true) + 3 < getAvgLength(false);
}

export const buildEChartsLabelOptions = (
  seriesModel: SeriesModel,
  dataset: ChartDataset,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
  show?: boolean,
  position?: "top" | "bottom" | "inside",
): SeriesLabelOption => {
  return {
    silent: true,
    show,
    position,
    opacity: 1,
    fontFamily: renderingContext.fontFamily,
    fontWeight: CHART_STYLE.seriesLabels.weight,
    fontSize: CHART_STYLE.seriesLabels.size,
    color: renderingContext.getColor("text-dark"),
    textBorderColor: renderingContext.getColor("white"),
    textBorderWidth: 3,
    formatter: getDataLabelFormatter(
      seriesModel,
      dataset,
      yAxisScaleTransforms,
      settings,
      seriesModel.dataKey,
      renderingContext,
    ),
  };
};

export const computeContinuousScaleBarWidth = (
  xAxisModel: TimeSeriesXAxisModel | NumericXAxisModel,
  boundaryWidth: number,
  barSeriesCount: number,
  yAxisWithBarSeriesCount: number,
  stackedOrSingleSeries: boolean,
) => {
  let barWidth =
    (boundaryWidth / (xAxisModel.intervalsCount + 2)) *
    CHART_STYLE.series.barWidth;

  if (!stackedOrSingleSeries) {
    barWidth /= barSeriesCount;
  }

  barWidth /= yAxisWithBarSeriesCount;

  return barWidth;
};

export const computeBarWidth = (
  xAxisModel: XAxisModel,
  boundaryWidth: number,
  barSeriesCount: number,
  yAxisWithBarSeriesCount: number,
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
      yAxisWithBarSeriesCount,
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
  settings: ComputedVisualizationSettings,
  yAxisIndex: number,
  barSeriesCount: number,
  yAxisWithBarSeriesCount: number,
  hasMultipleSeries: boolean,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["bar"] => {
  const stackName =
    settings["stackable.stack_type"] != null ? `bar_${yAxisIndex}` : undefined;

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
      yAxisWithBarSeriesCount,
      !!stackName,
    ),
    encode: {
      y: seriesModel.dataKey,
      x: X_AXIS_DATA_KEY,
    },
    label: buildEChartsLabelOptions(
      seriesModel,
      dataset,
      yAxisScaleTransforms,
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
  yAxisScaleTransforms: NumericAxisScaleTransforms,
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
      dataset,
      yAxisScaleTransforms,
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
  yAxisScaleTransforms: NumericAxisScaleTransforms,
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
      formatter: getStackedDataLabelFormatter(
        chartModel.transformedDataset,
        seriesModel,
        yAxisScaleTransforms,
        signKey,
        stackDataKeys,
        settings,
        renderingContext,
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
};

function getStackedDataLabelFormatter(
  dataset: ChartDataset,
  seriesModel: SeriesModel,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  signKey: StackTotalDataKey,
  stackDataKeys: DataKey[],
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) {
  const isCompact = shouldRenderCompact({
    dataset,
    getValue: (datum: Datum) =>
      getStackTotalValue(datum, stackDataKeys, signKey),
    renderingContext,
    seriesModel,
    settings,
  });

  return (params: LabelLayoutOptionCallbackParams & { data: Datum }) => {
    const stackValue = getStackTotalValue(params.data, stackDataKeys, signKey);

    if (stackValue === null) {
      return " ";
    }

    const valueFormatter = (value: RowValue) => {
      if (typeof value !== "number") {
        return " ";
      }

      return renderingContext.formatValue(
        yAxisScaleTransforms.fromEChartsAxisValue(value),
        {
          ...(settings.column?.(seriesModel.column) ?? {}),
          jsx: false,
          compact: isCompact,
        },
      );
    };

    return valueFormatter(stackValue);
  };
}

function getStackTotalValue(
  data: Datum,
  stackDataKeys: DataKey[],
  signKey: StackTotalDataKey,
): number | null {
  let stackValue: number | null = null;
  stackDataKeys.forEach(stackDataKey => {
    const seriesValue = data[stackDataKey];
    if (
      typeof seriesValue === "number" &&
      ((signKey === POSITIVE_STACK_TOTAL_DATA_KEY && seriesValue > 0) ||
        (signKey === NEGATIVE_STACK_TOTAL_DATA_KEY && seriesValue < 0))
    ) {
      stackValue = (stackValue ?? 0) + seriesValue;
    }
  });

  return stackValue;
}

export const getStackTotalsSeries = (
  chartModel: CartesianChartModel,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
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
        yAxisScaleTransforms,
        settings,
        POSITIVE_STACK_TOTAL_DATA_KEY,
        stackDataKeys,
        firstSeriesInStack,
        renderingContext,
      ),
      generateStackOption(
        chartModel,
        yAxisScaleTransforms,
        settings,
        NEGATIVE_STACK_TOTAL_DATA_KEY,
        stackDataKeys,
        firstSeriesInStack,
        renderingContext,
      ),
    ];
  });
};

const getDisplaySeriesSettingsByDataKey = (
  seriesModels: SeriesModel[],
  settings: ComputedVisualizationSettings,
) => {
  const seriesSettingsByKey = seriesModels.reduce((acc, seriesModel) => {
    acc[seriesModel.dataKey] = settings.series(
      seriesModel.legacySeriesSettingsObjectKey,
    );
    return acc;
  }, {} as Record<DataKey, SeriesSettings>);

  if (settings["stackable.stack_type"] === "stacked") {
    const stackDisplay = settings["stackable.stack_display"];

    Object.keys(seriesSettingsByKey).forEach(dataKey => {
      seriesSettingsByKey[dataKey].display = stackDisplay;
    });
  }

  return seriesSettingsByKey;
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

  const barSeriesCountByYAxisIndex = chartModel.seriesModels.reduce(
    (acc, seriesModel) => {
      const isBar =
        seriesSettingsByDataKey[seriesModel.dataKey].display === "bar";

      if (isBar) {
        const yAxisIndex = seriesYAxisIndexByDataKey[seriesModel.dataKey];
        acc[yAxisIndex] = (acc[yAxisIndex] ?? 0) + 1;
      }

      return acc;
    },
    {} as Record<number, number>,
  );

  const yAxisWithBarSeriesCount = Object.keys(
    barSeriesCountByYAxisIndex,
  ).length;

  const barSeriesCount = Object.values(seriesSettingsByDataKey).filter(
    seriesSettings => seriesSettings.display === "bar",
  ).length;

  const hasMultipleSeries = chartModel.seriesModels.length > 1;

  const series = chartModel.seriesModels
    .map(seriesModel => {
      const seriesSettings = seriesSettingsByDataKey[seriesModel.dataKey];
      const yAxisIndex = seriesYAxisIndexByDataKey[seriesModel.dataKey];

      switch (seriesSettings.display) {
        case "line":
        case "area":
          return buildEChartsLineAreaSeries(
            seriesModel,
            seriesSettings,
            chartModel.transformedDataset,
            chartModel.yAxisScaleTransforms,
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
            chartModel.yAxisScaleTransforms,
            chartMeasurements,
            seriesModel,
            settings,
            yAxisIndex,
            barSeriesCount,
            yAxisWithBarSeriesCount,
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

  if (
    settings["stackable.stack_type"] === "stacked" &&
    settings["graph.show_values"]
  ) {
    series.push(
      // @ts-expect-error TODO: figure out ECharts series option types
      ...getStackTotalsSeries(
        chartModel,
        chartModel.yAxisScaleTransforms,
        settings,
        series,
        renderingContext,
      ),
    );
  }

  // @ts-expect-error TODO: figure out ECharts series option types
  return series;
};
