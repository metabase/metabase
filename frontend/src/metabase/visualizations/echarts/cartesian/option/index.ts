import type { EChartsCoreOption } from "echarts/core";
import type { OptionSourceData } from "echarts/types/src/util/types";

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
import {
  buildEChartsSeries,
  computeBarWidth,
} from "metabase/visualizations/echarts/cartesian/option/series";
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
    toolbox: ["lineX" as const],
    xAxisIndex: 0,
    throttleType: "debounce" as const,
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
): EChartsCoreOption => {
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

  // const barSeriesCount = chartModel.seriesModels.reduce(
  //   (count, seriesModel) =>
  //     settings.series(seriesModel.legacySeriesSettingsObjectKey).display ===
  //     "bar"
  //       ? count + 1
  //       : count,
  //   0,
  // );

  const seriesOption = [
    // Data series should always come first for correct labels positioning
    // since series labelLayout function params return seriesIndex which is used to access label value
    dataSeriesOptions,
    goalSeriesOption,
    trendSeriesOption,
    timelineEventsSeries,
    // TODO move this, restore other options
    {
      id: "_other",
      emphasis: {
        focus: "series",
        itemStyle: {
          color: "#88BF4D",
        },
      },
      blur: {
        label: {
          show: false,
          opacity: 1,
        },
        itemStyle: {
          opacity: 0.3,
        },
      },
      type: "bar",
      z: 6,
      yAxisIndex: 0,
      barGap: 0,
      barWidth: computeBarWidth(
        chartModel.xAxisModel,
        chartMeasurements.boundaryWidth,
        (settings["graph.max_categories"] ?? 0) + 1, // TODO fix this check (should not always add 1, only when there are grouped series), also refactor to common func, also cap max_categories
        1, // TODO fix this
        false,
      ),
      encode: {
        y: "_other",
        x: "\u0000_x",
      },
      label: {
        silent: true,
        show: false,
        opacity: 1,
        fontFamily: "Lato",
        fontWeight: 600,
        fontSize: 12,
        color: "#4C5773",
        textBorderColor: "#FFFFFF",
        textBorderWidth: 3,
      },
      itemStyle: {
        color: "#949AAB",
      },
    },
  ].flatMap(option => option ?? []);

  const groupedSeriesKeysSet = new Set(chartModel.groupedSeriesKeys);

  // dataset option
  const dimensions = [
    X_AXIS_DATA_KEY,
    "_other", // TODO use constant
    ...chartModel.seriesModels
      .map(seriesModel => seriesModel.dataKey)
      .filter(key => !groupedSeriesKeysSet.has(key)),
  ];

  if (settings["stackable.stack_type"] != null) {
    dimensions.push(
      ...[POSITIVE_STACK_TOTAL_DATA_KEY, NEGATIVE_STACK_TOTAL_DATA_KEY],
    );
  }

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
    ...getSharedEChartsOptions(isPlaceholder),
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
      hoveredSeriesDataKey,
      renderingContext,
    ),
  };
};
