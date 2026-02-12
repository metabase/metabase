import type { ChartMeasurements } from "metabase/visualizations/echarts/cartesian/chart-measurements/types";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import type { DataKey } from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import {
  BOXPLOT_DATA_LABEL_STYLE,
  BOXPLOT_LABEL_PADDING,
  LABEL_DISTANCE,
  MEAN_SYMBOL_SIZE_OFFSET,
} from "../constants";
import type { BoxPlotChartModel, BoxPlotDatum } from "../model/types";
import type { LabelLayoutMode } from "../utils";
import {
  computeSeriesXOffsetPixels,
  getBoxPlotBoxWidth,
  getBoxPlotSymbolSize,
  getLabelLayoutMode,
} from "../utils";

import type {
  BoxPlotLabelOverflow,
  BoxPlotLayoutModel,
  BoxPlotPadding,
  BoxPlotSideLabelOverflow,
} from "./types";

export type {
  BoxPlotLayoutModel,
  BoxPlotLabelOverflow,
  BoxPlotSideLabelOverflow,
  BoxPlotPadding,
};

type LayoutParams = {
  chartModel: BoxPlotChartModel;
  chartMeasurements: ChartMeasurements;
  settings: ComputedVisualizationSettings;
  chartWidth: number;
  renderingContext: RenderingContext;
};

type DataExtremesResult = {
  dataMin: number;
  dataMax: number;
  minIsOutlier: boolean;
  maxIsOutlier: boolean;
} | null;

const getAllBoxPlotValues = (datum: BoxPlotDatum): number[] => [
  datum.min,
  datum.q1,
  datum.median,
  datum.q3,
  datum.max,
];

const getLabelExtension = (
  isOutlier: boolean,
  symbolRadius: number,
  labelHeight: number,
  labelLayoutMode: LabelLayoutMode,
): number => {
  if (isOutlier) {
    return symbolRadius + LABEL_DISTANCE + labelHeight;
  }
  return labelLayoutMode === "vertical"
    ? LABEL_DISTANCE + labelHeight
    : labelHeight / 2;
};

const getMaxLabelWidth = (
  values: number[],
  measureLabel: (value: number) => number,
): number => {
  if (values.length === 0) {
    return 0;
  }
  return Math.max(...values.map(measureLabel), 0);
};

const getLeftSideLabels = (
  datum: BoxPlotDatum,
  showValuesMode: string,
): number[] => (showValuesMode === "all" ? [datum.q1, datum.q3] : []);

const getRightSideLabels = (
  datum: BoxPlotDatum,
  showValuesMode: string,
): number[] =>
  showValuesMode === "median"
    ? [datum.median]
    : [datum.min, datum.max, datum.median];

const getVerticalLabels = (
  datum: BoxPlotDatum,
  showValuesMode: string,
): number[] =>
  showValuesMode === "all" ? getAllBoxPlotValues(datum) : [datum.median];

const findDataExtremes = (
  dataBySeriesAndXValue: Map<DataKey, Map<RowValue, BoxPlotDatum>>,
  includeOutliers: boolean,
): DataExtremesResult => {
  let dataMin = Infinity;
  let dataMax = -Infinity;
  let minIsOutlier = false;
  let maxIsOutlier = false;

  for (const xValueMap of dataBySeriesAndXValue.values()) {
    for (const datum of xValueMap.values()) {
      if (Number.isFinite(datum.min) && datum.min < dataMin) {
        dataMin = datum.min;
        minIsOutlier = false;
      }
      if (Number.isFinite(datum.max) && datum.max > dataMax) {
        dataMax = datum.max;
        maxIsOutlier = false;
      }

      if (includeOutliers) {
        datum.outliers.forEach((outlier) => {
          if (Number.isFinite(outlier)) {
            if (outlier < dataMin) {
              dataMin = outlier;
              minIsOutlier = true;
            }
            if (outlier > dataMax) {
              dataMax = outlier;
              maxIsOutlier = true;
            }
          }
        });
      }
    }
  }

  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) {
    return null;
  }

  return { dataMin, dataMax, minIsOutlier, maxIsOutlier };
};

const getTransformedAxisBound = (
  customValue: number | undefined,
  dataValue: number,
  isAutoRange: boolean,
  shouldUseZero: boolean,
  toEChartsAxisValue: (value: number) => number | null,
  transformedDataValue: number,
): number => {
  if (typeof customValue === "number" && Number.isFinite(customValue)) {
    const transformed = toEChartsAxisValue(customValue);
    if (transformed != null) {
      return transformed;
    }
  } else if (!isAutoRange && shouldUseZero) {
    const transformedZero = toEChartsAxisValue(0);
    if (transformedZero != null) {
      return transformedZero;
    }
  }
  return transformedDataValue;
};

const computeSideLabelOverflow = (
  chartModel: BoxPlotChartModel,
  xValueWidth: number,
  labelLayoutMode: LabelLayoutMode,
  labelOffset: number,
  seriesCount: number,
  renderingContext: RenderingContext,
): BoxPlotSideLabelOverflow => {
  const {
    xValues,
    dataBySeriesAndXValue,
    seriesModels,
    showValuesMode,
    seriesLabelsFormatters,
    leftAxisModel,
    rightAxisModel,
  } = chartModel;

  const hasFormatters = Object.keys(seriesLabelsFormatters).length > 0;
  if (!showValuesMode || !hasFormatters || xValues.length === 0) {
    return { left: 0, right: 0, leftYAxisOffset: 0, rightYAxisOffset: 0 };
  }

  const fontStyle = {
    weight: BOXPLOT_DATA_LABEL_STYLE.fontWeight,
    size: BOXPLOT_DATA_LABEL_STYLE.fontSize,
    family: renderingContext.fontFamily,
  };

  const spaceFromCenterToEdge = xValueWidth / 2;
  const firstXValue = xValues[0];
  const lastXValue = xValues[xValues.length - 1];

  let leftOverflow = 0;
  let rightOverflow = 0;

  seriesModels.forEach((seriesModel, seriesIndex) => {
    const labelFormatter = seriesLabelsFormatters[seriesModel.dataKey];
    if (!labelFormatter) {
      return;
    }

    const measureLabel = (value: number): number => {
      if (!Number.isFinite(value)) {
        return 0;
      }
      return renderingContext.measureText(labelFormatter(value), fontStyle);
    };

    const seriesDataMap = dataBySeriesAndXValue.get(seriesModel.dataKey);
    const xOffset = computeSeriesXOffsetPixels(
      xValueWidth,
      seriesIndex,
      seriesCount,
    );

    const firstDatum = seriesDataMap?.get(firstXValue);
    const lastDatum = seriesDataMap?.get(lastXValue);
    const negativeXOffset = Math.abs(Math.min(0, xOffset));
    const positiveXOffset = Math.max(0, xOffset);

    if (labelLayoutMode === "side") {
      if (firstDatum) {
        const maxLabelWidth = getMaxLabelWidth(
          getLeftSideLabels(firstDatum, showValuesMode),
          measureLabel,
        );
        if (maxLabelWidth > 0) {
          const extension = labelOffset + maxLabelWidth + negativeXOffset;
          leftOverflow = Math.max(
            leftOverflow,
            extension - spaceFromCenterToEdge,
          );
        }
      }

      if (lastDatum) {
        const maxLabelWidth = getMaxLabelWidth(
          getRightSideLabels(lastDatum, showValuesMode),
          measureLabel,
        );
        if (maxLabelWidth > 0) {
          const extension = labelOffset + maxLabelWidth + positiveXOffset;
          rightOverflow = Math.max(
            rightOverflow,
            extension - spaceFromCenterToEdge,
          );
        }
      }
    } else {
      if (firstDatum) {
        const maxLabelWidth = getMaxLabelWidth(
          getVerticalLabels(firstDatum, showValuesMode),
          measureLabel,
        );
        leftOverflow = Math.max(
          leftOverflow,
          maxLabelWidth / 2 + negativeXOffset - spaceFromCenterToEdge,
        );
      }

      if (lastDatum) {
        const maxLabelWidth = getMaxLabelWidth(
          getVerticalLabels(lastDatum, showValuesMode),
          measureLabel,
        );
        rightOverflow = Math.max(
          rightOverflow,
          maxLabelWidth / 2 + positiveXOffset - spaceFromCenterToEdge,
        );
      }
    }
  });

  leftOverflow = Math.max(0, leftOverflow);
  rightOverflow = Math.max(0, rightOverflow);

  const hasLeftAxis = leftAxisModel != null;
  const hasRightAxis = rightAxisModel != null;

  return {
    left: leftOverflow,
    right: rightOverflow,
    leftYAxisOffset: hasLeftAxis ? leftOverflow : 0,
    rightYAxisOffset: hasRightAxis ? rightOverflow : 0,
  };
};

const computeLabelOverflow = (
  chartModel: BoxPlotChartModel,
  settings: ComputedVisualizationSettings,
  labelLayoutMode: LabelLayoutMode,
  symbolSize: number,
  innerHeight: number,
): BoxPlotLabelOverflow => {
  const {
    dataBySeriesAndXValue,
    pointsMode,
    showValuesMode,
    seriesLabelsFormatters,
    yAxisScaleTransforms,
  } = chartModel;

  const hasFormatters = Object.keys(seriesLabelsFormatters).length > 0;
  if (
    showValuesMode == null ||
    !hasFormatters ||
    dataBySeriesAndXValue.size === 0
  ) {
    return { top: 0, bottom: 0 };
  }

  const includeOutliersInRange = pointsMode !== "none";
  const extremes = findDataExtremes(
    dataBySeriesAndXValue,
    includeOutliersInRange,
  );
  if (extremes == null) {
    return { top: 0, bottom: 0 };
  }

  const { dataMin, dataMax, minIsOutlier, maxIsOutlier } = extremes;
  const { toEChartsAxisValue } = yAxisScaleTransforms;

  const transformedDataMin = toEChartsAxisValue(dataMin);
  const transformedDataMax = toEChartsAxisValue(dataMax);
  if (transformedDataMin == null || transformedDataMax == null) {
    return { top: 0, bottom: 0 };
  }

  const isAutoRange = settings["graph.y_axis.auto_range"] === true;
  const axisMin = getTransformedAxisBound(
    settings["graph.y_axis.min"],
    dataMin,
    isAutoRange,
    dataMin > 0,
    toEChartsAxisValue,
    transformedDataMin,
  );
  const axisMax = getTransformedAxisBound(
    settings["graph.y_axis.max"],
    dataMax,
    isAutoRange,
    dataMax < 0,
    toEChartsAxisValue,
    transformedDataMax,
  );

  const labelHeight = CHART_STYLE.seriesLabels.size;
  const symbolRadius = symbolSize / 2;
  // In "all" mode we show min/max box labels AND outlier labels
  // In "median" mode we only show the median label (no overflow concern)
  const showsMinMaxLabels = showValuesMode === "all";

  if (!showsMinMaxLabels) {
    return { top: 0, bottom: 0 };
  }

  // Only consider outlier label extension if we're showing outlier labels (in "all" mode with points)
  const showsOutlierLabels = showValuesMode === "all" && pointsMode !== "none";
  const bottomExtension = getLabelExtension(
    minIsOutlier && showsOutlierLabels,
    symbolRadius,
    labelHeight,
    labelLayoutMode,
  );
  const topExtension = getLabelExtension(
    maxIsOutlier && showsOutlierLabels,
    symbolRadius,
    labelHeight,
    labelLayoutMode,
  );

  let bottomOverflow = 0;
  let topOverflow = 0;

  if (innerHeight > 0) {
    const axisRange = axisMax - axisMin;
    if (axisRange > 0) {
      const pixelsPerUnit = innerHeight / axisRange;
      const bottomPixelsFromAxis =
        (transformedDataMin - axisMin) * pixelsPerUnit;
      const topPixelsFromAxis = (axisMax - transformedDataMax) * pixelsPerUnit;

      if (bottomPixelsFromAxis < bottomExtension) {
        bottomOverflow = bottomExtension;
      }
      if (topPixelsFromAxis < topExtension) {
        topOverflow = topExtension;
      }
    }
  } else {
    if (transformedDataMin <= axisMin) {
      bottomOverflow = bottomExtension;
    }
    if (transformedDataMax >= axisMax) {
      topOverflow = topExtension;
    }
  }

  return { bottom: bottomOverflow, top: topOverflow };
};

const computeOverflows = (
  chartModel: BoxPlotChartModel,
  settings: ComputedVisualizationSettings,
  boundsWidth: number,
  boundsHeight: number,
  xValuesCount: number,
  seriesCount: number,
  initialSubcategoryWidth: number,
  renderingContext: RenderingContext,
): {
  labelOverflow: BoxPlotLabelOverflow;
  sideLabelOverflow: BoxPlotSideLabelOverflow;
} => {
  const labelLayoutMode = getLabelLayoutMode(initialSubcategoryWidth);
  const symbolSize = getBoxPlotSymbolSize(initialSubcategoryWidth);
  const labelOffset =
    getBoxPlotBoxWidth(initialSubcategoryWidth) / 2 + BOXPLOT_LABEL_PADDING;
  const xValueWidth = boundsWidth / Math.max(xValuesCount, 1);

  return {
    labelOverflow: computeLabelOverflow(
      chartModel,
      settings,
      labelLayoutMode,
      symbolSize,
      boundsHeight,
    ),
    sideLabelOverflow: computeSideLabelOverflow(
      chartModel,
      xValueWidth,
      labelLayoutMode,
      labelOffset,
      seriesCount,
      renderingContext,
    ),
  };
};

export const getBoxPlotLayoutModel = (
  params: LayoutParams,
): BoxPlotLayoutModel => {
  const {
    chartModel,
    chartMeasurements,
    settings,
    chartWidth,
    renderingContext,
  } = params;

  const { bounds, padding: basePadding } = chartMeasurements;
  const boundsWidth = bounds.right - bounds.left;
  const boundsHeight = bounds.bottom - bounds.top;

  const { xValues, seriesModels } = chartModel;
  const seriesCount = seriesModels.length;
  const xValuesCount = xValues.length;

  const initialSubcategoryWidth =
    boundsWidth / Math.max(xValuesCount, 1) / Math.max(seriesCount, 1);

  const { labelOverflow, sideLabelOverflow } = computeOverflows(
    chartModel,
    settings,
    boundsWidth,
    boundsHeight,
    xValuesCount,
    seriesCount,
    initialSubcategoryWidth,
    renderingContext,
  );

  const adjustedPadding: BoxPlotPadding = {
    top: basePadding.top + labelOverflow.top,
    bottom: basePadding.bottom + labelOverflow.bottom,
    left: basePadding.left + sideLabelOverflow.left,
    right: basePadding.right + sideLabelOverflow.right,
  };

  const xValueWidth =
    (chartWidth - adjustedPadding.left - adjustedPadding.right) /
    Math.max(xValuesCount, 1);
  const subcategoryWidth = xValueWidth / Math.max(seriesCount, 1);

  const labelLayoutMode = getLabelLayoutMode(subcategoryWidth);
  const boxWidth = getBoxPlotBoxWidth(subcategoryWidth);
  const boxHalfWidth = boxWidth / 2;
  const symbolSize = getBoxPlotSymbolSize(subcategoryWidth);
  const meanSymbolSize = symbolSize + MEAN_SYMBOL_SIZE_OFFSET;
  const labelOffset = boxHalfWidth + BOXPLOT_LABEL_PADDING;

  const visibleSeriesModels = seriesModels.filter((s) => s.visible);
  const visibleSeriesCount = visibleSeriesModels.length;
  const visibleSeriesOffsets = new Map(
    visibleSeriesModels.map((s, index) => [
      s.dataKey,
      computeSeriesXOffsetPixels(xValueWidth, index, visibleSeriesCount),
    ]),
  );

  const xAxisOffset = labelOverflow.bottom;

  return {
    xValuesCount,
    xValueWidth,
    labelLayoutMode,
    boxWidth,
    boxHalfWidth,
    symbolSize,
    meanSymbolSize,
    labelOffset,
    subcategoryWidth,
    visibleSeriesOffsets,
    labelOverflow,
    sideLabelOverflow,
    adjustedPadding,
    xAxisOffset,
    chartMeasurements,
  };
};
