import type { EChartsOption } from "echarts";
import type { CartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import { buildEChartsSeries } from "metabase/visualizations/echarts/cartesian/option/series";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import { buildAxes } from "metabase/visualizations/echarts/cartesian/option/axis";

import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import { getTimelineEventsSeries } from "metabase/visualizations/echarts/cartesian/timeline-events/option";
import type { TimelineEventId } from "metabase-types/api";
import {
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { getGoalLineSeriesOption } from "./goal-line";
import { getTrendLineOptionsAndDatasets } from "./trend-line";
import { getChartSidePadding } from "./padding";

export const getCartesianChartOption = (
  chartModel: CartesianChartModel,
  timelineEventsModel: TimelineEventsModel | null,
  selectedTimelineEventsIds: TimelineEventId[],
  settings: ComputedVisualizationSettings,
  chartWidth: number,
  renderingContext: RenderingContext,
): EChartsOption => {
  const hasTimelineEvents = timelineEventsModel != null;
  const timelineEventsSeries = hasTimelineEvents
    ? getTimelineEventsSeries(
        timelineEventsModel,
        selectedTimelineEventsIds,
        renderingContext,
      )
    : null;

  // series option
  const dataSeriesOptions = buildEChartsSeries(
    chartModel,
    settings,
    chartWidth,
    renderingContext,
  );
  const goalSeriesOption = getGoalLineSeriesOption(
    chartModel,
    settings,
    renderingContext,
  );
  const { options: trendSeriesOptions, datasets: trendDatasets } =
    getTrendLineOptionsAndDatasets(chartModel, settings, renderingContext);

  const seriesOption = [
    // Data series should always come first for correct labels positioning
    // since series labelLayout function params return seriesIndex which is used to access label value
    dataSeriesOptions,
    goalSeriesOption,
    trendSeriesOptions,
    timelineEventsSeries,
  ].flatMap(option => option ?? []);

  // dataset option
  const dimensions = [
    X_AXIS_DATA_KEY,
    ...chartModel.seriesModels.map(seriesModel => seriesModel.dataKey),
    ...[POSITIVE_STACK_TOTAL_DATA_KEY, NEGATIVE_STACK_TOTAL_DATA_KEY],
  ];
  const echartsDataset = [
    { source: chartModel.transformedDataset, dimensions },
    ...(trendDatasets ?? []),
  ];

  const {
    xAxis,
    yAxis,
    firstDimensionLabel,
    firstDimensionLabelDataIndex,
    lastDimensionLabel,
    lastDimensionLabelDataIndex,
  } = buildAxes(chartModel, settings, hasTimelineEvents, renderingContext);

  getChartSidePadding(
    chartModel,
    chartWidth,
    firstDimensionLabel,
    firstDimensionLabelDataIndex,
    lastDimensionLabel,
    lastDimensionLabelDataIndex,
  );

  return {
    animation: true,
    animationDuration: 0,
    toolbox: {
      show: false,
    },
    brush: {
      toolbox: ["lineX"],
      xAxisIndex: 0,
      throttleType: "debounce",
      throttleDelay: 200,
    },
    grid: {
      ...chartModel.chartMeasurements.padding,
      containLabel: true,
    },
    dataset: echartsDataset,
    series: seriesOption,
    xAxis,
    yAxis,
  } as EChartsOption;
};
