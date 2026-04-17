import type { EChartsCoreOption } from "echarts/core";
import type { XAXisOption, YAXisOption } from "echarts/types/dist/shared";
import type { OptionSourceData } from "echarts/types/src/util/types";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { TimelineEventId } from "metabase-types/api";

import { X_AXIS_DATA_KEY } from "../../constants/dataset";
import type { ChartLayout } from "../../layout/types";
import type { ScatterPlotModel } from "../../model/types";
import {
  buildGridAndSeriesOption,
  buildPerPanelXAxes,
  buildPerPanelYAxes,
  getSharedEChartsOptions,
} from "../../option";
import { buildAxes, buildDimensionAxis } from "../../option/axis";
import type { EChartsSeriesOption } from "../../option/types";
import { getSeriesYAxisIndex } from "../../option/utils";
import type { TimelineEventsModel } from "../../timeline-events/types";

import { buildEChartsScatterSeries } from "./series";

export function getScatterPlotOption(
  chartModel: ScatterPlotModel,
  chartLayout: ChartLayout,
  timelineEventsModel: TimelineEventsModel | null,
  selectedTimelineEventsIds: TimelineEventId[],
  settings: ComputedVisualizationSettings,
  chartWidth: number,
  isAnimated: boolean,
  renderingContext: RenderingContext,
): EChartsCoreOption {
  const hasTimelineEvents = timelineEventsModel != null;
  const isSplitPanels = chartLayout.panelHeight != null;

  const visibleSeries = chartModel.seriesModels.filter(
    (series) => series.visible,
  );
  const panelCount = visibleSeries.length;

  const dataSeriesOptions: EChartsSeriesOption[] = visibleSeries.map(
    (seriesModel, index) =>
      buildEChartsScatterSeries(
        seriesModel,
        chartModel.bubbleSizeDomain,
        isSplitPanels
          ? index
          : getSeriesYAxisIndex(seriesModel.dataKey, chartModel),
        renderingContext,
        isSplitPanels ? index : undefined,
      ),
  );

  const { grid, seriesOption, splitPanelOverrides } = buildGridAndSeriesOption(
    chartModel,
    chartLayout,
    timelineEventsModel,
    selectedTimelineEventsIds,
    settings,
    renderingContext,
    dataSeriesOptions,
  );

  const dimensions = [
    X_AXIS_DATA_KEY,
    ...chartModel.seriesModels.map((seriesModel) => seriesModel.dataKey),
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
        ...(chartModel.trendLinesModel?.seriesModels.map(
          (series) => series.dataKey,
        ) ?? []),
      ],
    });
  }

  let xAxis: XAXisOption | XAXisOption[];
  let yAxis: YAXisOption[];

  if (isSplitPanels) {
    const baseXAxis = buildDimensionAxis(
      chartModel,
      settings,
      chartLayout,
      hasTimelineEvents,
      renderingContext,
    );

    xAxis = buildPerPanelXAxes(baseXAxis, panelCount, renderingContext);
    yAxis = buildPerPanelYAxes(
      chartModel,
      chartLayout,
      settings,
      renderingContext,
    );
  } else {
    const axes = buildAxes(
      chartModel,
      chartLayout,
      settings,
      hasTimelineEvents,
      renderingContext,
    );
    xAxis = axes.xAxis;
    yAxis = axes.yAxis;
  }

  return {
    ...getSharedEChartsOptions(isAnimated, renderingContext),
    ...splitPanelOverrides,
    grid,
    xAxis,
    yAxis,
    dataset: echartsDataset,
    series: seriesOption,
  };
}
