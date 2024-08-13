import type { EChartsCoreOption } from "echarts/core";
import type { OptionSourceData } from "echarts/types/src/util/types";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { TimelineEventId } from "metabase-types/api";

import type { ChartMeasurements } from "../../chart-measurements/types";
import { X_AXIS_DATA_KEY } from "../../constants/dataset";
import type { ScatterPlotModel } from "../../model/types";
import { getSharedEChartsOptions } from "../../option";
import { buildAxes } from "../../option/axis";
import { getGoalLineSeriesOption } from "../../option/goal-line";
import { getTrendLinesOption } from "../../option/trend-line";
import type { EChartsSeriesOption } from "../../option/types";
import { getSeriesYAxisIndex } from "../../option/utils";
import { getTimelineEventsSeries } from "../../timeline-events/option";
import type { TimelineEventsModel } from "../../timeline-events/types";

import { buildEChartsScatterSeries } from "./series";

export function getScatterPlotOption(
  chartModel: ScatterPlotModel,
  chartMeasurements: ChartMeasurements,
  timelineEventsModel: TimelineEventsModel | null,
  selectedTimelineEventsIds: TimelineEventId[],
  settings: ComputedVisualizationSettings,
  chartWidth: number,
  isAnimated: boolean,
  renderingContext: RenderingContext,
): EChartsCoreOption {
  const hasTimelineEvents = timelineEventsModel != null;
  const timelineEventsSeries = hasTimelineEvents
    ? getTimelineEventsSeries(
        timelineEventsModel,
        selectedTimelineEventsIds,
        renderingContext,
      )
    : null;

  const dataSeriesOptions: EChartsSeriesOption[] = chartModel.seriesModels.map(
    seriesModel =>
      buildEChartsScatterSeries(
        seriesModel,
        chartModel.bubbleSizeDomain,
        getSeriesYAxisIndex(seriesModel.dataKey, chartModel),
        renderingContext,
      ),
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

  const dimensions = [
    X_AXIS_DATA_KEY,
    ...chartModel.seriesModels.map(seriesModel => seriesModel.dataKey),
  ];

  const echartsDataset = [
    {
      // Type cast is needed here because echarts' internal types are incorrect.
      // Their types do not allow booleans, but in reality booleans do work as
      // data values, see this example
      // https://echarts.apache.org/examples/en/editor.html?c=line-simple&code=PYBwLglsB2AEC8sDeAoWsAmBDMWDOApmAFzJrqx7ACuATgMYGkDaSARFm6QGZYA2hADSw2AIy6wAjAF9h7TqTC1qBYWIkAmaQF1ys8gA8AggYh5SqCrDABPEE1gByejgIBzYLRuPBe3-hsTMwtydFt7UkcAN34VRz9yQloIAnNYZlCyKzC7B0c-CGgCH0z0Amh6YAwHS2z0A1IONn862BtG8VLYaUye9F1pAG4gA
      source: chartModel.transformedDataset as OptionSourceData,
      dimensions,
    },
  ];

  if (chartModel.trendLinesModel) {
    echartsDataset.push({
      source: chartModel.trendLinesModel?.dataset as OptionSourceData,
      dimensions: [
        X_AXIS_DATA_KEY,
        ...chartModel.trendLinesModel?.seriesModels.map(s => s.dataKey),
      ],
    });
  }

  return {
    ...getSharedEChartsOptions(isAnimated),
    grid: {
      ...chartMeasurements.padding,
    },
    dataset: echartsDataset,
    series: seriesOption,
    ...buildAxes(
      chartModel,
      chartWidth,
      chartMeasurements,
      settings,
      hasTimelineEvents,
      null,
      renderingContext,
    ),
  };
}
