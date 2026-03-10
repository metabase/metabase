import type { EChartsCoreOption } from "echarts/core";
import type { YAXisOption } from "echarts/types/dist/shared";
import type { OptionSourceData } from "echarts/types/src/util/types";

import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { getSharedEChartsOptions } from "metabase/visualizations/echarts/cartesian/option";
import {
  buildCategoricalDimensionAxis,
  buildMetricAxis,
} from "metabase/visualizations/echarts/cartesian/option/axis";
import {
  getGoalLineParams,
  getGoalLineSeriesOption,
} from "metabase/visualizations/echarts/cartesian/option/goal-line";
import { getTimelineEventsSeries } from "metabase/visualizations/echarts/cartesian/timeline-events/option";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { TimelineEventId } from "metabase-types/api";

import { BOXPLOT_STATS } from "../constants";
import type { BoxPlotLayoutModel } from "../layout/types";
import type { BoxPlotChartModel } from "../model/types";
import { getBoxPlotStatKey } from "../utils";

import {
  buildEChartsBoxPlotLabelsSeries,
  buildEChartsBoxPlotSeries,
  buildEChartsMeanSeries,
  buildEChartsPointsSeries,
} from "./series";

const buildBoxPlotYAxisOption = (
  chartModel: BoxPlotChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
  position: "left" | "right",
  ticksWidth: number,
  showAxisLine: boolean,
  labelOffset: number,
): YAXisOption | null => {
  const axisModel =
    position === "left" ? chartModel.leftAxisModel : chartModel.rightAxisModel;

  if (!axisModel) {
    return null;
  }

  const axisOption = buildMetricAxis(
    axisModel,
    chartModel.yAxisScaleTransforms,
    ticksWidth,
    settings,
    position,
    showAxisLine,
    renderingContext,
  );

  if (labelOffset > 0) {
    return { ...axisOption, offset: labelOffset };
  }
  return axisOption;
};

export const getBoxPlotOption = (
  chartModel: BoxPlotChartModel,
  layoutModel: BoxPlotLayoutModel,
  timelineEventsModel: TimelineEventsModel | null,
  selectedTimelineEventsIds: TimelineEventId[],
  settings: ComputedVisualizationSettings,
  isAnimated: boolean,
  renderingContext: RenderingContext,
): EChartsCoreOption => {
  const { xValues, xAxisModel } = chartModel;

  if (xValues.length === 0) {
    return {};
  }

  const { adjustedPadding, sideLabelOverflow, xAxisOffset, chartMeasurements } =
    layoutModel;

  const hasTimelineEvents = timelineEventsModel != null;
  const timelineEventsSeries = hasTimelineEvents
    ? getTimelineEventsSeries(
        timelineEventsModel,
        selectedTimelineEventsIds,
        renderingContext,
      )
    : null;

  const pointsDatasetIndices = {
    outlierAbove: chartModel.outlierAbovePointsDataset.length > 0 ? 1 : -1,
    outlierBelow: -1,
    nonOutlier: -1,
  };
  let nextIndex = pointsDatasetIndices.outlierAbove === 1 ? 2 : 1;
  if (chartModel.outlierBelowPointsDataset.length > 0) {
    pointsDatasetIndices.outlierBelow = nextIndex++;
  }
  if (chartModel.nonOutlierPointsDataset.length > 0) {
    pointsDatasetIndices.nonOutlier = nextIndex;
  }

  const boxPlotSeriesArray = buildEChartsBoxPlotSeries(
    chartModel,
    layoutModel,
    renderingContext,
  );
  const pointsSeries = buildEChartsPointsSeries(
    chartModel,
    layoutModel,
    renderingContext,
    settings,
    pointsDatasetIndices,
  );
  const meanSeries = buildEChartsMeanSeries(
    chartModel,
    layoutModel,
    renderingContext,
  );
  const labelsSeries = buildEChartsBoxPlotLabelsSeries(
    chartModel,
    layoutModel,
    renderingContext,
    settings,
  );

  const goalSeriesOption = getGoalLineSeriesOption(
    getGoalLineParams({
      ...chartModel,
      dataset: chartModel.boxDataset,
    }),
    settings,
    renderingContext,
  );

  const series = [
    ...boxPlotSeriesArray,
    ...pointsSeries,
    ...meanSeries,
    ...labelsSeries,
    goalSeriesOption,
    timelineEventsSeries,
  ].flatMap((option) => option ?? []);

  const xAxis = buildCategoricalDimensionAxis(
    {
      formatter: xAxisModel.formatter,
      column: chartModel.dimensionModel.column,
      datasetLength: xValues.length,
    },
    settings,
    chartMeasurements,
    renderingContext,
  );

  const { leftAxisModel, rightAxisModel } = chartModel;
  const hasDualYAxis = leftAxisModel != null && rightAxisModel != null;

  const leftYAxis = buildBoxPlotYAxisOption(
    chartModel,
    settings,
    renderingContext,
    "left",
    chartMeasurements.ticksDimensions.yTicksWidthLeft,
    true,
    sideLabelOverflow.leftYAxisOffset,
  );

  const rightYAxis = buildBoxPlotYAxisOption(
    chartModel,
    settings,
    renderingContext,
    "right",
    chartMeasurements.ticksDimensions.yTicksWidthRight,
    !hasDualYAxis,
    sideLabelOverflow.rightYAxisOffset,
  );

  const yAxis = [leftYAxis, rightYAxis].filter(Boolean);

  const boxDimensions = [
    X_AXIS_DATA_KEY,
    ...chartModel.seriesModels.flatMap((seriesModel) =>
      BOXPLOT_STATS.map((stat) => getBoxPlotStatKey(seriesModel.dataKey, stat)),
    ),
  ];

  const pointsDimensions = [
    X_AXIS_DATA_KEY,
    ...chartModel.seriesModels.map((seriesModel) => seriesModel.dataKey),
  ];

  const datasets: { source: OptionSourceData; dimensions: string[] }[] = [
    {
      source: chartModel.boxDataset as OptionSourceData,
      dimensions: boxDimensions,
    },
  ];

  if (pointsDatasetIndices.outlierAbove >= 0) {
    datasets.push({
      source: chartModel.outlierAbovePointsDataset as OptionSourceData,
      dimensions: pointsDimensions,
    });
  }
  if (pointsDatasetIndices.outlierBelow >= 0) {
    datasets.push({
      source: chartModel.outlierBelowPointsDataset as OptionSourceData,
      dimensions: pointsDimensions,
    });
  }
  if (pointsDatasetIndices.nonOutlier >= 0) {
    datasets.push({
      source: chartModel.nonOutlierPointsDataset as OptionSourceData,
      dimensions: pointsDimensions,
    });
  }

  return {
    ...getSharedEChartsOptions(isAnimated),
    grid: {
      ...adjustedPadding,
      outerBoundsMode: "none",
    },
    dataset: datasets,
    series,
    yAxis,
    xAxis: {
      ...xAxis,
      ...(xAxisOffset > 0 && { offset: xAxisOffset }),
    },
  };
};
