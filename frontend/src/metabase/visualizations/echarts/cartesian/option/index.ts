import type { EChartsOption } from "echarts";
import type { CartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import { buildEChartsSeries } from "metabase/visualizations/echarts/cartesian/option/series";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import { buildAxes } from "metabase/visualizations/echarts/cartesian/option/axis";

import { getChartMeasurements } from "metabase/visualizations/echarts/cartesian/utils/layout";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import { getTimelineEventsSeries } from "metabase/visualizations/echarts/cartesian/timeline-events/option";
import type { TimelineEventId } from "metabase-types/api";
import { getGoalLineSeriesOption } from "./goal-line";
import { getTrendLineOptionsAndDatasets } from "./trend-line";

export const getCartesianChartOption = (
  chartModel: CartesianChartModel,
  timelineEventsModel: TimelineEventsModel | null,
  selectedTimelineEventsIds: TimelineEventId[],
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): EChartsOption => {
  const hasTimelineEvents = timelineEventsModel != null;
  const chartMeasurements = getChartMeasurements(
    chartModel,
    settings,
    hasTimelineEvents,
    renderingContext,
  );
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
    goalSeriesOption,
    trendSeriesOptions,
    dataSeriesOptions,
    timelineEventsSeries,
  ].flatMap(option => option ?? []);

  // dataset option
  const dimensions = [
    chartModel.dimensionModel.dataKey,
    ...chartModel.seriesModels.map(seriesModel => seriesModel.dataKey),
  ];
  const echartsDataset = [
    { source: chartModel.transformedDataset, dimensions },
    ...(trendDatasets ?? []),
  ];

  return {
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
      ...chartMeasurements.padding,
      containLabel: true,
    },
    dataset: echartsDataset,
    series: seriesOption,
    ...buildAxes(
      chartModel,
      settings,
      chartMeasurements,
      hasTimelineEvents,
      renderingContext,
    ),
  } as EChartsOption;
};
