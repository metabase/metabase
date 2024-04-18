import type {
  RegisteredSeriesOption,
  EChartsOption,
  SeriesOption,
} from "echarts";
import type { DatasetOption } from "echarts/types/dist/shared";
import type { LabelLayoutOptionCallback } from "echarts/types/src/util/types";
import type {
  BaseCartesianChartModel,
  ChartDataset,
  DataKey,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import {
  buildEChartsLabelOptions,
  computeBarWidth,
  getDataLabelFormatter,
} from "metabase/visualizations/echarts/cartesian/option/series";
import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import {
  WATERFALL_END_2_KEY,
  WATERFALL_END_KEY,
  WATERFALL_LABELS_SERIES_ID,
  WATERFALL_START_2_KEY,
  WATERFALL_START_KEY,
  WATERFALL_TOTAL_KEY,
  WATERFALL_VALUE_KEY,
} from "metabase/visualizations/echarts/cartesian/waterfall/constants";
import type { TimelineEventId } from "metabase-types/api";
import { getNumberOr } from "metabase/visualizations/lib/settings/row-values";
import type { ChartMeasurements } from "../../chart-measurements/types";
import type { TimelineEventsModel } from "../../timeline-events/types";
import { getTimelineEventsSeries } from "../../timeline-events/option";
import { buildAxes } from "../../option/axis";
import { getSharedEChartsOptions } from "../../option";

type WaterfallSeriesOptions =
  | RegisteredSeriesOption["line"]
  | RegisteredSeriesOption["bar"]
  | RegisteredSeriesOption["candlestick"];

const getLabelLayoutFn = (
  dataset: ChartDataset,
  chartMeasurements: ChartMeasurements,
  settings: ComputedVisualizationSettings,
): LabelLayoutOptionCallback => {
  return params => {
    const { dataIndex, rect } = params;
    if (dataIndex == null) {
      return {};
    }

    const datum = dataset[dataIndex];
    const value = datum[WATERFALL_VALUE_KEY] ?? 0;
    const end = datum[WATERFALL_END_KEY] ?? 0;
    const isIncrease = getNumberOr(value, 0) >= 0;

    const verticalAlignOffset =
      CHART_STYLE.seriesLabels.size / 2 + CHART_STYLE.seriesLabels.offset;

    const hasBottomSpace =
      rect.y + CHART_STYLE.seriesLabels.size + CHART_STYLE.seriesLabels.offset <
      chartMeasurements.bounds.bottom;

    const barHeight = rect.height;
    const endSign = getNumberOr(end, 0) < 0 ? 1 : -1;
    let labelOffset = (endSign * barHeight) / 2;
    labelOffset +=
      isIncrease || !hasBottomSpace
        ? -verticalAlignOffset
        : verticalAlignOffset;

    return {
      hideOverlap: settings["graph.label_value_frequency"] === "fit",
      dy: labelOffset,
    };
  };
};

export const buildEChartsWaterfallSeries = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  chartMeasurements: ChartMeasurements,
  renderingContext: RenderingContext,
): WaterfallSeriesOptions[] => {
  const { seriesModels, transformedDataset: dataset } = chartModel;
  const [seriesModel] = seriesModels;
  const barWidth = computeBarWidth(
    chartModel.xAxisModel,
    chartMeasurements,
    1,
    1,
    false,
  );

  const buildLabelOption = (key: DataKey) => ({
    ...buildEChartsLabelOptions(
      seriesModel,
      settings,
      renderingContext,
      settings["graph.show_values"],
    ),
    formatter: getDataLabelFormatter(
      seriesModel,
      settings,
      key,
      renderingContext,
      {
        negativeInParentheses: true,
      },
    ),
  });

  const series: WaterfallSeriesOptions[] = [
    {
      id: seriesModel.dataKey,
      type: "candlestick",
      itemStyle: {
        color: settings["waterfall.increase_color"],
        color0: settings["waterfall.decrease_color"],
        borderColor: "transparent",
        borderColor0: "transparent",
        borderColorDoji: "transparent",
        borderWidth: 0,
      },
      animationDuration: 0,
      barWidth,
      dimensions: [
        X_AXIS_DATA_KEY,
        WATERFALL_START_KEY,
        WATERFALL_END_KEY,
        WATERFALL_START_2_KEY,
        WATERFALL_END_2_KEY,
      ],
      encode: {
        x: X_AXIS_DATA_KEY,
        y: [
          WATERFALL_START_KEY,
          WATERFALL_END_KEY,
          WATERFALL_START_2_KEY,
          WATERFALL_END_2_KEY,
        ],
      },
      z: CHART_STYLE.series.zIndex,
    },
    {
      id: WATERFALL_LABELS_SERIES_ID,
      type: "line",
      z: CHART_STYLE.seriesLabels.zIndex,
      silent: true,
      dimensions: [X_AXIS_DATA_KEY, WATERFALL_VALUE_KEY, WATERFALL_END_KEY],
      itemStyle: {
        color: "transparent",
      },
      symbolSize: 0,
      labelLayout: getLabelLayoutFn(dataset, chartMeasurements, settings),
      encode: {
        y: WATERFALL_END_KEY,
        x: X_AXIS_DATA_KEY,
      },
      label: buildLabelOption(WATERFALL_VALUE_KEY),
      animationDuration: 0,
    },
  ];

  if (settings["waterfall.show_total"]) {
    series.push({
      id: WATERFALL_TOTAL_KEY,
      type: "bar",
      barWidth,
      z: CHART_STYLE.series.zIndex,
      dimensions: [X_AXIS_DATA_KEY, WATERFALL_TOTAL_KEY],
      encode: {
        y: WATERFALL_TOTAL_KEY,
        x: X_AXIS_DATA_KEY,
      },
      itemStyle: {
        color: settings["waterfall.total_color"],
      },
      animationDuration: 0,
    });
  }

  return series;
};

export const getWaterfallChartOption = (
  chartModel: BaseCartesianChartModel,
  chartMeasurements: ChartMeasurements,
  timelineEventsModel: TimelineEventsModel | null,
  selectedTimelineEventsIds: TimelineEventId[],
  settings: ComputedVisualizationSettings,
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

  const dataSeriesOptions = buildEChartsWaterfallSeries(
    chartModel,
    settings,
    chartMeasurements,
    renderingContext,
  );

  const seriesOption = [dataSeriesOptions, timelineEventsSeries].flatMap(
    option => option ?? [],
  );

  const echartsDataset = [{ source: chartModel.transformedDataset }];

  return {
    ...getSharedEChartsOptions(),
    grid: {
      ...chartMeasurements.padding,
      containLabel: true,
    },
    dataset: echartsDataset as DatasetOption,
    series: seriesOption as SeriesOption,
    ...buildAxes(
      chartModel,
      chartMeasurements,
      settings,
      hasTimelineEvents,
      renderingContext,
    ),
  } as EChartsOption;
};
