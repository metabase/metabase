import type { EChartsCoreOption } from "echarts/core";
import type { LabelLayoutOptionCallback } from "echarts/types/src/util/types";

import { X_AXIS_DATA_KEY } from "metabase/visualizations/echarts/cartesian/constants/dataset";
import {
  CHART_STYLE,
  Z_INDEXES,
} from "metabase/visualizations/echarts/cartesian/constants/style";
import type {
  ChartDataset,
  LabelFormatter,
  WaterfallChartModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import {
  buildEChartsLabelOptions,
  computeContinuousScaleBarWidth,
  getDataLabelFormatter,
} from "metabase/visualizations/echarts/cartesian/option/series";
import {
  WATERFALL_END_KEY,
  WATERFALL_LABELS_SERIES_ID,
  WATERFALL_START_KEY,
  WATERFALL_TOTAL_KEY,
  WATERFALL_VALUE_KEY,
} from "metabase/visualizations/echarts/cartesian/waterfall/constants";
import type { WaterfallSeriesOption } from "metabase/visualizations/echarts/types";
import { getNumberOr } from "metabase/visualizations/lib/settings/row-values";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { TimelineEventId } from "metabase-types/api";

import type { ChartMeasurements } from "../../chart-measurements/types";
import { isCategoryAxis } from "../../model/guards";
import { getSharedEChartsOptions } from "../../option";
import { buildAxes } from "../../option/axis";
import { getTimelineEventsSeries } from "../../timeline-events/option";
import type { TimelineEventsModel } from "../../timeline-events/types";

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

const computeWaterfallBarWidth = (
  chartModel: WaterfallChartModel,
  boundaryWidth: number,
) => {
  if (isCategoryAxis(chartModel.xAxisModel)) {
    return (
      (boundaryWidth / chartModel.dataset.length + 2) *
      CHART_STYLE.series.barWidth
    );
  }
  return computeContinuousScaleBarWidth(
    chartModel.xAxisModel,
    boundaryWidth,
    1,
    true,
  );
};

export const buildEChartsWaterfallSeries = (
  chartModel: WaterfallChartModel,
  settings: ComputedVisualizationSettings,
  chartMeasurements: ChartMeasurements,
  chartWidth: number,
  labelFormatter: LabelFormatter | undefined,
  renderingContext: RenderingContext,
) => {
  const { seriesModels, transformedDataset: dataset } = chartModel;
  const [seriesModel] = seriesModels;
  const barWidth = computeWaterfallBarWidth(
    chartModel,
    chartMeasurements.boundaryWidth,
  );

  const buildLabelOption = () => ({
    ...buildEChartsLabelOptions(
      seriesModel,
      chartModel.yAxisScaleTransforms,
      renderingContext,
      chartWidth,
      labelFormatter,
    ),
    formatter:
      labelFormatter &&
      getDataLabelFormatter(
        WATERFALL_VALUE_KEY,
        chartModel.yAxisScaleTransforms,
        labelFormatter,
        chartWidth,
        settings,
        chartModel.dataDensity,
      ),
  });

  const series: WaterfallSeriesOption[] = [
    {
      id: seriesModel.dataKey,
      type: "custom",
      clip: true,
      animationDuration: 0,
      dimensions: [X_AXIS_DATA_KEY, WATERFALL_START_KEY, WATERFALL_END_KEY],
      encode: {
        x: X_AXIS_DATA_KEY,
        y: [WATERFALL_START_KEY, WATERFALL_END_KEY],
      },
      z: Z_INDEXES.series,
      renderItem: (_params, api) => {
        const xValue = api.value(0);
        const yStart = api.value(1);
        const yEnd = api.value(2);

        const startCoord = api.coord([xValue, yStart]);
        const endCoord = api.coord([xValue, yEnd]);
        const rectHeight = startCoord[1] - endCoord[1];
        const isIncrease = yEnd >= yStart;

        const fill = isIncrease
          ? settings["waterfall.increase_color"]
          : settings["waterfall.decrease_color"];

        return {
          type: "rect",
          shape: {
            x: endCoord[0] - barWidth / 2,
            y: endCoord[1],
            width: barWidth,
            height: rectHeight,
          },
          style: {
            fill,
          },
        };
      },
    },
    {
      id: WATERFALL_LABELS_SERIES_ID,
      type: "scatter",
      z: Z_INDEXES.dataLabels,
      silent: true,
      dimensions: [X_AXIS_DATA_KEY, WATERFALL_VALUE_KEY, WATERFALL_END_KEY],
      symbolSize: 0,
      labelLayout: getLabelLayoutFn(dataset, chartMeasurements, settings),
      encode: {
        y: WATERFALL_END_KEY,
        x: X_AXIS_DATA_KEY,
      },
      label: buildLabelOption(),
      animationDuration: 0,
    },
  ];

  if (settings["waterfall.show_total"]) {
    series.push({
      id: WATERFALL_TOTAL_KEY,
      type: "bar",
      barWidth,
      z: Z_INDEXES.series,
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
  chartModel: WaterfallChartModel,
  chartWidth: number,
  chartMeasurements: ChartMeasurements,
  timelineEventsModel: TimelineEventsModel | null,
  selectedTimelineEventsIds: TimelineEventId[],
  settings: ComputedVisualizationSettings,
  isAnimated: boolean,
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

  const dataSeriesOptions = buildEChartsWaterfallSeries(
    chartModel,
    settings,
    chartMeasurements,
    chartWidth,
    chartModel.waterfallLabelFormatter,
    renderingContext,
  );

  const seriesOption: WaterfallSeriesOption[] = [
    dataSeriesOptions,
    timelineEventsSeries,
  ].flatMap(option => option ?? []);

  const echartsDataset = [{ source: chartModel.transformedDataset }];

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
};
