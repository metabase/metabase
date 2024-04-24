import type { EChartsOption } from "echarts";

import {
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  CartesianChartModel,
  DataKey,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { buildAxes } from "metabase/visualizations/echarts/cartesian/option/axis";
import { buildEChartsSeries } from "metabase/visualizations/echarts/cartesian/option/series";
import { getTimelineEventsSeries } from "metabase/visualizations/echarts/cartesian/timeline-events/option";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { TimelineEventId } from "metabase-types/api";

import type { ChartMeasurements } from "../chart-measurements/types";

import { getGoalLineSeriesOption } from "./goal-line";
import { getTrendLinesOption } from "./trend-line";

export const getSharedEChartsOptions = (isPlaceholder: boolean) => ({
  useUTC: true,
  animation: !isPlaceholder,
  animationDuration: 0,
  animationDurationUpdate: 1, // by setting this to 1ms we visually eliminate shape transitions while preserving opacity transitions
  toolbox: {
    show: false,
  },
  brush: {
    toolbox: ["lineX"],
    xAxisIndex: 0,
    throttleType: "debounce",
    throttleDelay: 200,
  },
});

export const getCartesianChartOption = (
  chartModel: CartesianChartModel,
  chartMeasurements: ChartMeasurements,
  timelineEventsModel: TimelineEventsModel | null,
  selectedTimelineEventsIds: TimelineEventId[],
  settings: ComputedVisualizationSettings,
  chartWidth: number,
  isPlaceholder: boolean,
  hoveredSeriesDataKey: DataKey | null,
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
    chartMeasurements,
    renderingContext,
  );
  const goalSeriesOption = getGoalLineSeriesOption(
    chartModel,
    settings,
    renderingContext,
  );
  const trendSeriesOption = getTrendLinesOption(chartModel);

  const seriesOption = [
    // Data series should always come first for correct labels positioning
    // since series labelLayout function params return seriesIndex which is used to access label value
    dataSeriesOptions,
    goalSeriesOption,
    trendSeriesOption,
    timelineEventsSeries,
  ].flatMap(option => option ?? []);

  // dataset option
  const dimensions = [
    X_AXIS_DATA_KEY,
    ...chartModel.seriesModels.map(seriesModel => seriesModel.dataKey),
  ];

  if (settings["stackable.stack_type"] != null) {
    dimensions.push(
      ...[POSITIVE_STACK_TOTAL_DATA_KEY, NEGATIVE_STACK_TOTAL_DATA_KEY],
    );
  }

  const echartsDataset = [
    { source: chartModel.transformedDataset, dimensions },
  ];

  if (chartModel.trendLinesModel) {
    echartsDataset.push({
      source: chartModel.trendLinesModel?.dataset,
      dimensions: [
        X_AXIS_DATA_KEY,
        ...chartModel.trendLinesModel?.seriesModels.map(s => s.dataKey),
      ],
    });
  }

  return {
    ...getSharedEChartsOptions(isPlaceholder),
    grid: {
      ...chartMeasurements.padding,
      containLabel: true,
    },
    dataset: echartsDataset,
    series: seriesOption,
    ...buildAxes(
      chartModel,
      chartWidth,
      chartMeasurements,
      settings,
      hasTimelineEvents,
      hoveredSeriesDataKey,
      renderingContext,
    ),
  } as EChartsOption;
};
