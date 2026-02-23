import Color from "color";
import type {
  BoxplotSeriesOption,
  LineSeriesOption,
  ScatterSeriesOption,
} from "echarts/charts";

import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import {
  CHART_STYLE,
  Z_INDEXES,
} from "metabase/visualizations/echarts/cartesian/constants/style";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import {
  BLUR_OPACITY,
  BOXPLOT_DATA_LABEL_STYLE,
  BOXPLOT_MAX_BOX_WIDTH,
  BOXPLOT_MIN_BOX_WIDTH,
  BOXPLOT_SERIES_NAME,
  BOX_FILL_OPACITY,
  EMPHASIS_DARKEN_FACTOR,
  LABEL_DISTANCE,
  MEAN_COLOR_DARKEN_FACTOR,
  NON_OUTLIER_OPACITY,
} from "../constants";
import type { BoxPlotLayoutModel } from "../layout/types";
import type { BoxPlotChartModel } from "../model/types";
import {
  getBoxPlotStatKey,
  getDataPointsSeriesName,
  getMeanSeriesName,
  getOutliersSeriesName,
} from "../utils";

const getSeriesYAxisIndex = (
  chartModel: BoxPlotChartModel,
  dataKey: string,
): number => {
  const { leftAxisSeriesKeys, rightAxisSeriesKeys } = chartModel;

  if (rightAxisSeriesKeys.has(dataKey)) {
    return leftAxisSeriesKeys.size > 0 ? 1 : 0;
  }
  return 0;
};

export const buildEChartsBoxPlotSeries = (
  chartModel: BoxPlotChartModel,
  layoutModel: BoxPlotLayoutModel,
  renderingContext: RenderingContext,
): BoxplotSeriesOption[] => {
  const { seriesModels } = chartModel;
  const { boxWidth } = layoutModel;

  return seriesModels
    .filter((seriesModel) => seriesModel.visible)
    .map((seriesModel) => {
      const seriesColor =
        seriesModel.color ?? renderingContext.getColor("brand");
      const fillColor = Color(seriesColor).alpha(BOX_FILL_OPACITY).string();
      const yAxisIndex = getSeriesYAxisIndex(chartModel, seriesModel.dataKey);
      const dataKey = seriesModel.dataKey;

      return {
        type: "boxplot",
        id: dataKey,
        name: seriesModel.name ?? BOXPLOT_SERIES_NAME,
        datasetIndex: 0,
        encode: {
          x: X_AXIS_DATA_KEY,
          y: [
            getBoxPlotStatKey(dataKey, "min"),
            getBoxPlotStatKey(dataKey, "q1"),
            getBoxPlotStatKey(dataKey, "median"),
            getBoxPlotStatKey(dataKey, "q3"),
            getBoxPlotStatKey(dataKey, "max"),
          ],
        },
        z: Z_INDEXES.series,
        yAxisIndex,
        boxWidth: [
          BOXPLOT_MIN_BOX_WIDTH,
          Math.min(boxWidth, BOXPLOT_MAX_BOX_WIDTH),
        ],
        itemStyle: {
          color: fillColor,
          borderColor: seriesColor,
          borderWidth: 1,
        },
        emphasis: {
          focus: "series",
          scale: false,
          itemStyle: {
            color: fillColor,
            borderColor: Color(seriesColor)
              .darken(EMPHASIS_DARKEN_FACTOR)
              .string(),
            borderWidth: 1,
            shadowBlur: 0,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            shadowColor: "transparent",
            opacity: 1,
          },
        },
        blur: {
          itemStyle: {
            opacity: BLUR_OPACITY,
          },
        },
      };
    });
};

export const buildEChartsMeanSeries = (
  chartModel: BoxPlotChartModel,
  layoutModel: BoxPlotLayoutModel,
  renderingContext: RenderingContext,
): ScatterSeriesOption[] => {
  const { showMean, seriesModels } = chartModel;
  const { visibleSeriesOffsets } = layoutModel;

  if (!showMean) {
    return [];
  }

  return seriesModels
    .filter((seriesModel) => seriesModel.visible)
    .map((seriesModel) => {
      const seriesColor =
        seriesModel.color ?? renderingContext.getColor("brand");
      const meanColor = Color(seriesColor)
        .darken(MEAN_COLOR_DARKEN_FACTOR)
        .hex();
      const xOffsetPixels = visibleSeriesOffsets.get(seriesModel.dataKey) ?? 0;
      const yAxisIndex = getSeriesYAxisIndex(chartModel, seriesModel.dataKey);
      const meanKey = getBoxPlotStatKey(seriesModel.dataKey, "mean");

      return {
        type: "scatter",
        name: getMeanSeriesName(seriesModel.dataKey),
        datasetIndex: 0,
        encode: {
          x: X_AXIS_DATA_KEY,
          y: meanKey,
        },
        z: Z_INDEXES.series + 1,
        yAxisIndex,
        symbol: "diamond",
        symbolSize: layoutModel.meanSymbolSize,
        symbolOffset: [xOffsetPixels, 0],
        silent: true,
        itemStyle: {
          color: meanColor,
          opacity: 1,
          borderColor: renderingContext.getColor("background-primary"),
          borderWidth: 1,
        },
        emphasis: {
          disabled: true,
        },
      };
    });
};

export type PointsDatasetIndices = {
  outlierAbove: number;
  outlierBelow: number;
  nonOutlier: number;
};

export const buildEChartsPointsSeries = (
  chartModel: BoxPlotChartModel,
  layoutModel: BoxPlotLayoutModel,
  renderingContext: RenderingContext,
  settings: ComputedVisualizationSettings,
  datasetIndices: PointsDatasetIndices,
): ScatterSeriesOption[] => {
  const {
    pointsMode,
    seriesModels,
    yAxisScaleTransforms,
    showValuesMode,
    seriesLabelsFormatters,
    labelFrequency,
  } = chartModel;
  const { fromEChartsAxisValue } = yAxisScaleTransforms;
  const { visibleSeriesOffsets } = layoutModel;

  if (pointsMode === "none") {
    return [];
  }

  const hideOverlap = labelFrequency === "fit";

  return seriesModels
    .filter((seriesModel) => seriesModel.visible)
    .flatMap((seriesModel) => {
      const seriesSettings = settings?.series(
        seriesModel.legacySeriesSettingsObjectKey,
      );
      const showSeriesValues = seriesSettings?.show_series_values ?? true;
      const labelFormatter = seriesLabelsFormatters[seriesModel.dataKey];
      const showLabels =
        showValuesMode === "all" && labelFormatter != null && showSeriesValues;

      const seriesColor =
        seriesModel.color ?? renderingContext.getColor("brand");
      const xOffsetPixels = visibleSeriesOffsets.get(seriesModel.dataKey) ?? 0;
      const yAxisIndex = getSeriesYAxisIndex(chartModel, seriesModel.dataKey);
      const dataKey = seriesModel.dataKey;

      const getOutlierLabelConfig = (
        position: "top" | "bottom",
      ): Partial<ScatterSeriesOption> => {
        if (!showLabels || !labelFormatter) {
          return { label: { show: false } };
        }

        return {
          label: {
            show: true,
            position,
            distance: LABEL_DISTANCE,
            fontFamily: renderingContext.fontFamily,
            fontWeight: BOXPLOT_DATA_LABEL_STYLE.fontWeight,
            fontSize: BOXPLOT_DATA_LABEL_STYLE.fontSize,
            color: renderingContext.getColor("text-primary"),
            textBorderColor: renderingContext.getColor("background-primary"),
            textBorderWidth: BOXPLOT_DATA_LABEL_STYLE.textBorderWidth,
            formatter: (params) => {
              const data = params.data as Record<string, unknown> | undefined;
              const y = data?.[dataKey] as number | null | undefined;
              if (y == null || !Number.isFinite(y)) {
                return "";
              }
              const originalValue = fromEChartsAxisValue(y);
              return labelFormatter(originalValue);
            },
          },
          labelLayout: { hideOverlap },
        };
      };

      const createOutlierSeries = (
        datasetIndex: number,
        labelPosition: "top" | "bottom",
      ): ScatterSeriesOption => ({
        type: "scatter",
        name: getOutliersSeriesName(dataKey),
        datasetIndex,
        encode: {
          x: X_AXIS_DATA_KEY,
          y: dataKey,
        },
        z: Z_INDEXES.series + 1,
        yAxisIndex,
        symbolSize: layoutModel.symbolSize,
        symbolOffset: [xOffsetPixels, 0],
        itemStyle: {
          color: seriesColor,
          opacity: CHART_STYLE.opacity.scatter,
          borderColor: renderingContext.getColor("background-primary"),
          borderWidth: 1,
        },
        ...getOutlierLabelConfig(labelPosition),
        emphasis: { disabled: true },
      });

      const series: ScatterSeriesOption[] = [];

      if (datasetIndices.outlierAbove >= 0) {
        series.push(createOutlierSeries(datasetIndices.outlierAbove, "top"));
      }
      if (datasetIndices.outlierBelow >= 0) {
        series.push(createOutlierSeries(datasetIndices.outlierBelow, "bottom"));
      }
      if (pointsMode === "all" && datasetIndices.nonOutlier >= 0) {
        series.push({
          type: "scatter",
          name: getDataPointsSeriesName(dataKey),
          datasetIndex: datasetIndices.nonOutlier,
          encode: {
            x: X_AXIS_DATA_KEY,
            y: dataKey,
          },
          z: Z_INDEXES.series,
          yAxisIndex,
          symbolSize: layoutModel.symbolSize,
          symbolOffset: [xOffsetPixels, 0],
          itemStyle: {
            color: seriesColor,
            opacity: NON_OUTLIER_OPACITY,
            borderColor: renderingContext.getColor("background-primary"),
            borderWidth: 1,
          },
          label: { show: false },
          emphasis: { focus: "none", itemStyle: { opacity: 1 } },
          blur: { itemStyle: { opacity: BLUR_OPACITY } },
        });
      }

      return series;
    });
};

type LabelPosition = "min" | "q1" | "median" | "q3" | "max";

const LABEL_SIDES: Record<LabelPosition, "left" | "right"> = {
  min: "right",
  q1: "left",
  median: "right",
  q3: "left",
  max: "right",
};

const LABEL_VERTICALS: Record<LabelPosition, "top" | "bottom"> = {
  min: "bottom",
  q1: "bottom",
  median: "top",
  q3: "top",
  max: "top",
};

export const buildEChartsBoxPlotLabelsSeries = (
  chartModel: BoxPlotChartModel,
  layoutModel: BoxPlotLayoutModel,
  renderingContext: RenderingContext,
  settings: ComputedVisualizationSettings,
): LineSeriesOption[] => {
  const {
    seriesModels,
    showValuesMode,
    seriesLabelsFormatters,
    labelFrequency,
    yAxisScaleTransforms,
  } = chartModel;
  const { fromEChartsAxisValue } = yAxisScaleTransforms;
  const { labelLayoutMode, labelOffset, visibleSeriesOffsets } = layoutModel;

  if (showValuesMode == null) {
    return [];
  }

  const hideOverlap = labelFrequency === "fit";

  return seriesModels
    .filter((seriesModel) => {
      if (!seriesModel.visible) {
        return false;
      }
      const labelFormatter = seriesLabelsFormatters[seriesModel.dataKey];
      if (!labelFormatter) {
        return false;
      }
      const seriesSettings = settings?.series(
        seriesModel.legacySeriesSettingsObjectKey,
      );
      return seriesSettings?.show_series_values ?? true;
    })
    .flatMap((seriesModel) => {
      const xOffset = visibleSeriesOffsets.get(seriesModel.dataKey) ?? 0;
      const yAxisIndex = getSeriesYAxisIndex(chartModel, seriesModel.dataKey);
      const dataKey = seriesModel.dataKey;
      const labelFormatter = seriesLabelsFormatters[dataKey]!;

      const createLabelSeries = (position: LabelPosition): LineSeriesOption => {
        const useSideLabels = labelLayoutMode === "side";
        const side = LABEL_SIDES[position];
        const isLeft = side === "left";
        const vertical = LABEL_VERTICALS[position];
        const isTop = vertical === "top";
        const statKey = getBoxPlotStatKey(dataKey, position);

        return {
          type: "line",
          name: `BoxPlot ${position} labels_${dataKey}`,
          datasetIndex: 0,
          encode: {
            x: X_AXIS_DATA_KEY,
            y: statKey,
          },
          z: Z_INDEXES.dataLabels,
          yAxisIndex,
          symbol: "circle",
          symbolSize: 0,
          silent: true,
          lineStyle: {
            opacity: 0,
          },
          label: {
            show: true,
            position: useSideLabels ? side : vertical,
            align: useSideLabels ? (isLeft ? "right" : "left") : "center",
            verticalAlign: useSideLabels ? "middle" : isTop ? "bottom" : "top",
            fontFamily: renderingContext.fontFamily,
            fontWeight: BOXPLOT_DATA_LABEL_STYLE.fontWeight,
            fontSize: BOXPLOT_DATA_LABEL_STYLE.fontSize,
            color: renderingContext.getColor("text-primary"),
            textBorderColor: renderingContext.getColor("background-primary"),
            textBorderWidth: BOXPLOT_DATA_LABEL_STYLE.textBorderWidth,
            formatter: (params) => {
              const data = params.data as Record<string, unknown>;
              const yValue = data[statKey] as number | null;
              if (yValue == null || !Number.isFinite(yValue)) {
                return "";
              }
              const originalValue = fromEChartsAxisValue(yValue);
              return labelFormatter(originalValue);
            },
          },
          labelLayout: useSideLabels
            ? () => ({
                hideOverlap,
                dx: (isLeft ? -labelOffset : labelOffset) + xOffset,
              })
            : () => ({
                hideOverlap,
                dx: xOffset,
              }),
          emphasis: {
            disabled: true,
          },
        };
      };

      if (showValuesMode === "median") {
        return [createLabelSeries("median")];
      }

      return [
        createLabelSeries("min"),
        createLabelSeries("q1"),
        createLabelSeries("median"),
        createLabelSeries("q3"),
        createLabelSeries("max"),
      ];
    });
};
