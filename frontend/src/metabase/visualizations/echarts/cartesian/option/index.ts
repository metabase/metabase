import type { EChartsCoreOption } from "echarts/core";
import type {
  GridOption,
  XAXisOption,
  YAXisOption,
} from "echarts/types/dist/shared";
import type { OptionSourceData } from "echarts/types/src/util/types";

import {
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  OTHER_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  BaseCartesianChartModel,
  CartesianChartModel,
  SeriesModel,
  YAxisModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import {
  buildAxes,
  buildDimensionAxis,
  buildMetricAxis,
} from "metabase/visualizations/echarts/cartesian/option/axis";
import { buildEChartsSeries } from "metabase/visualizations/echarts/cartesian/option/series";
import { getTimelineEventsSeries } from "metabase/visualizations/echarts/cartesian/timeline-events/option";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { TimelineEventId } from "metabase-types/api";

import { CHART_STYLE } from "../constants/style";
import type { ChartLayout } from "../layout/types";
import { getDisplaySeriesSettingsByDataKey } from "../model/series";
import { getBarSeriesDataLabelKey } from "../model/util";

import { getGoalLineParams, getGoalLineSeriesOption } from "./goal-line";
import { getTrendLinesOption } from "./trend-line";
import type { EChartsSeriesOption } from "./types";

export const getSharedEChartsOptions = (isAnimated: boolean) => ({
  useUTC: true,
  animation: isAnimated,
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

export const buildEChartsDataset = (
  chartModel: BaseCartesianChartModel,
): Array<{ source: OptionSourceData; dimensions: string[] }> => {
  const dimensions = [
    X_AXIS_DATA_KEY,
    OTHER_DATA_KEY,
    POSITIVE_STACK_TOTAL_DATA_KEY,
    NEGATIVE_STACK_TOTAL_DATA_KEY,
    ...chartModel.seriesModels.map((seriesModel) => [
      seriesModel.dataKey,
      getBarSeriesDataLabelKey(seriesModel.dataKey, "+"),
      getBarSeriesDataLabelKey(seriesModel.dataKey, "-"),
    ]),
  ].flatMap((dimension) => dimension);

  const dataset: Array<{ source: OptionSourceData; dimensions: string[] }> = [
    {
      source: chartModel.transformedDataset as OptionSourceData,
      dimensions,
    },
  ];

  if (chartModel.trendLinesModel) {
    dataset.push({
      source: chartModel.trendLinesModel.dataset as OptionSourceData,
      dimensions: [
        X_AXIS_DATA_KEY,
        ...(chartModel.trendLinesModel.seriesModels?.map(
          (series) => series.dataKey,
        ) ?? []),
      ],
    });
  }

  return dataset;
};

type Axes = ReturnType<typeof buildAxes>;

type NonCategoryYAxisOption = Exclude<YAXisOption, { type?: "category" }>;
const isNonCategoryYAxisOption = (
  axis: YAXisOption,
): axis is NonCategoryYAxisOption => axis.type !== "category";

export const ensureRoomForLabels = (
  axes: Axes,
  { leftAxisModel, rightAxisModel }: CartesianChartModel,
  chartLayout: ChartLayout,
  seriesOption: EChartsSeriesOption[],
): Axes => ({
  ...axes,
  yAxis: axes.yAxis.map((axis) => {
    const axisModel = axis.position === "left" ? leftAxisModel : rightAxisModel;
    if (!axisModel) {
      return axis;
    }
    const isAxisUsedForBarChart = axisModel.seriesKeys.some((key) => {
      return seriesOption.some((o) => o.id === key && o.type === "bar");
    });
    if (!isAxisUsedForBarChart) {
      return axis;
    }
    const [min] = axisModel.extent;
    if (min < 0) {
      const { bounds } = chartLayout;
      const innerHeight = Math.abs(bounds.bottom - bounds.top);
      const labelPct = CHART_STYLE.seriesLabels.size / innerHeight;
      const lowerBoundaryGap = labelPct / 2; // `/ 2` because it's okay if the bar label overlaps the axis *line*, we just don't want it to overlap the axis *labels*

      // Only apply numeric boundaryGap to non-category axes
      if (!isNonCategoryYAxisOption(axis)) {
        return axis;
      }

      return { ...axis, boundaryGap: [lowerBoundaryGap, 0] };
    }
    return axis;
  }),
});

export const getCartesianChartOption = (
  chartModel: CartesianChartModel,
  chartLayout: ChartLayout,
  timelineEventsModel: TimelineEventsModel | null,
  selectedTimelineEventsIds: TimelineEventId[],
  settings: ComputedVisualizationSettings,
  chartWidth: number,
  isAnimated: boolean,
  renderingContext: RenderingContext,
): EChartsCoreOption => {
  const isSplitPanels =
    chartLayout.panelCount != null && chartLayout.panelCount > 1;
  const hasTimelineEvents = timelineEventsModel != null;
  const visibleSeries = isSplitPanels
    ? chartModel.seriesModels.filter((series) => series.visible)
    : [];
  const panelCount = visibleSeries.length;

  // Series (shared — buildEChartsSeries handles split panels via chartLayout)
  const dataSeriesOptions = buildEChartsSeries(
    chartModel,
    settings,
    chartWidth,
    chartLayout,
    renderingContext,
  );

  const goalSeriesOption = getGoalLineSeriesOption(
    getGoalLineParams(chartModel),
    settings,
    renderingContext,
  );

  const trendSeriesOption = isSplitPanels
    ? remapTrendLinesToPanels(chartModel, visibleSeries)
    : getTrendLinesOption(chartModel);

  const timelineEventsSeries = hasTimelineEvents
    ? getTimelineEventsSeries(
        timelineEventsModel,
        selectedTimelineEventsIds,
        renderingContext,
      )
    : null;

  const seriesOption = [
    dataSeriesOptions,
    goalSeriesOption,
    trendSeriesOption,
    isSplitPanels && timelineEventsSeries
      ? {
          ...timelineEventsSeries,
          xAxisIndex: panelCount - 1,
          yAxisIndex: panelCount - 1,
        }
      : timelineEventsSeries,
  ].flatMap((option) => option ?? []);

  // Grid
  const grid: GridOption | GridOption[] = isSplitPanels
    ? visibleSeries.map((_, index) => ({
        left: chartLayout.padding.left,
        right: chartLayout.padding.right,
        top:
          chartLayout.padding.top +
          index *
            ((chartLayout.panelHeight ?? 0) + (chartLayout.panelGap ?? 0)),
        height: chartLayout.panelHeight ?? 0,
      }))
    : { ...chartLayout.padding, outerBoundsMode: "none" };

  // Axes
  let xAxis: XAXisOption | XAXisOption[];
  let yAxis: YAXisOption[];

  if (isSplitPanels) {
    const baseXAxis = buildDimensionAxis(
      chartModel,
      chartWidth,
      settings,
      chartLayout,
      false,
      renderingContext,
    );

    const seriesSettingsByDataKey = getDisplaySeriesSettingsByDataKey(
      chartModel.seriesModels,
      chartModel.stackModels,
      settings,
    );
    const hasAnyBarSeries = visibleSeries.some(
      (series) => seriesSettingsByDataKey[series.dataKey]?.display === "bar",
    );
    if (hasAnyBarSeries) {
      (baseXAxis as Record<string, unknown>).boundaryGap = true;
    }

    xAxis = buildPerPanelXAxes(baseXAxis, panelCount, renderingContext);
    yAxis = buildPerPanelYAxes(
      visibleSeries,
      chartModel,
      chartLayout,
      settings,
      renderingContext,
    );
  } else {
    const axes = ensureRoomForLabels(
      buildAxes(
        chartModel,
        chartWidth,
        chartLayout,
        settings,
        hasTimelineEvents,
        renderingContext,
      ),
      chartModel,
      chartLayout,
      dataSeriesOptions,
    );
    xAxis = axes.xAxis;
    yAxis = axes.yAxis;
  }

  const splitPanelOverrides = isSplitPanels
    ? {
        axisPointer: {
          link: [{ xAxisIndex: "all" as unknown as number }],
        },
        brush: {
          toolbox: ["lineX" as const],
          xAxisIndex: visibleSeries.map((_, index) => index),
          throttleType: "debounce" as const,
          throttleDelay: 200,
        },
        graphic: buildSplitPanelYAxisLabel(
          chartModel,
          chartLayout,
          panelCount,
          renderingContext,
        ),
      }
    : {};

  return {
    ...getSharedEChartsOptions(isAnimated),
    ...splitPanelOverrides,
    grid,
    xAxis,
    yAxis,
    dataset: buildEChartsDataset(chartModel),
    series: seriesOption,
  };
};

function buildSplitPanelYAxisLabel(
  chartModel: CartesianChartModel,
  chartLayout: ChartLayout,
  panelCount: number,
  renderingContext: RenderingContext,
): unknown[] {
  const label = chartModel.leftAxisModel?.label;
  if (!label) {
    return [];
  }

  const panelHeight = chartLayout.panelHeight ?? 0;
  const panelGap = chartLayout.panelGap ?? 0;
  const totalPanelsHeight =
    panelCount * panelHeight + (panelCount - 1) * panelGap;
  const { fontSize } = renderingContext.theme.cartesian.label;

  return [
    {
      type: "text",
      x: CHART_STYLE.padding.x + fontSize / 2,
      y: chartLayout.padding.top + totalPanelsHeight / 2,
      style: {
        text: label,
        fill: renderingContext.getColor("text-primary"),
        fontSize,
        fontWeight: CHART_STYLE.axisName.weight,
        fontFamily: renderingContext.fontFamily,
        textAlign: "center",
        textVerticalAlign: "middle",
      },
      rotation: Math.PI / 2,
    },
  ];
}

function buildPerPanelYAxes(
  visibleSeries: SeriesModel[],
  chartModel: CartesianChartModel,
  chartLayout: ChartLayout,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): YAXisOption[] {
  const maxYTicksWidth = chartLayout.maxYTicksWidth ?? 0;
  const defaultFormatter = (value: unknown) => String(value);

  return visibleSeries.map((seriesModel, index) => {
    const extent = chartLayout.perPanelYAxisExtents?.get(
      seriesModel.dataKey,
    ) ?? [0, 0];

    const axisModel: YAxisModel = chartModel.leftAxisModel
      ? {
          ...chartModel.leftAxisModel,
          extent,
          seriesKeys: [seriesModel.dataKey],
          label: undefined,
        }
      : {
          extent,
          column: seriesModel.column,
          seriesKeys: [seriesModel.dataKey],
          formatter: defaultFormatter,
          formatGoal: defaultFormatter,
          label: undefined,
          isNormalized: false,
        };

    return {
      ...buildMetricAxis(
        axisModel,
        chartModel.yAxisScaleTransforms,
        maxYTicksWidth - CHART_STYLE.axisTicksMarginY,
        settings,
        "left",
        true,
        renderingContext,
      ),
      gridIndex: index,
    };
  });
}

function buildPerPanelXAxes(
  baseXAxis: XAXisOption,
  panelCount: number,
  renderingContext: RenderingContext,
): XAXisOption[] {
  return Array.from({ length: panelCount }, (_, index) => {
    if (index === panelCount - 1) {
      return { ...baseXAxis, gridIndex: index };
    }

    return {
      ...baseXAxis,
      gridIndex: index,
      axisLabel: { show: false },
      axisTick: { show: false },
      name: undefined,
      nameGap: 0,
      axisLine: {
        show: true,
        lineStyle: { color: renderingContext.getColor("border") },
      },
    };
  });
}

function remapTrendLinesToPanels(
  chartModel: CartesianChartModel,
  visibleSeries: SeriesModel[],
): EChartsSeriesOption[] {
  const trendSeriesOptions = getTrendLinesOption(chartModel);

  return trendSeriesOptions.map((trendSeries, index) => {
    const sourceDataKey =
      chartModel.trendLinesModel?.seriesModels[index]?.sourceDataKey;
    if (sourceDataKey) {
      const panelIndex = visibleSeries.findIndex(
        (series) => series.dataKey === sourceDataKey,
      );
      if (panelIndex >= 0) {
        return {
          ...trendSeries,
          xAxisIndex: panelIndex,
          yAxisIndex: panelIndex,
        };
      }
    }
    return trendSeries;
  });
}
