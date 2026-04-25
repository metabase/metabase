import type { EChartsOption } from "echarts";
import type { EChartsType } from "echarts/core";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLatest } from "react-use";

import {
  GOAL_LINE_SERIES_ID,
  INDEX_KEY,
  TIMELINE_EVENT_DATA_NAME,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  BaseCartesianChartModel,
  ChartDataset,
} from "metabase/visualizations/echarts/cartesian/model/types";
import {
  buildBrushMirrorGraphics,
  buildClearBrushMirrorGraphics,
} from "metabase/visualizations/echarts/cartesian/option";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import { useClickedStateTooltipSync } from "metabase/visualizations/echarts/tooltip";
import {
  type EChartsSeriesBrushEndEvent,
  type EChartsSeriesBrushEvent,
  type EChartsSeriesMouseEvent,
  isLineXBrushRange,
} from "metabase/visualizations/echarts/types";
import { useChartYAxisVisibility } from "metabase/visualizations/hooks/use-chart-y-axis-visibility";
import type {
  RenderingContext,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";
import {
  canBrush,
  getBrushData,
  getGoalLineHoverData,
  getSeriesClickData,
  getSeriesHovered,
  getTimelineEventsForEvent,
  getTimelineEventsHoverData,
  hasSelectedTimelineEvents,
} from "metabase/visualizations/visualizations/CartesianChart/events";
import { getVisualizerSeriesCardIndex } from "metabase/visualizer/utils";
import type { CardId } from "metabase-types/api";

import { useBrush } from "./use-brush";
import { useTooltipMouseLeave } from "./use-tooltip-mouse-leave";
import { getHoveredEChartsSeriesDataKeyAndIndex } from "./utils";

function getSplitPanelGrids(option: EChartsOption) {
  const { grid } = option;
  return Array.isArray(grid) && grid.length > 1 ? grid : null;
}

export const useChartEvents = (
  chartRef: React.MutableRefObject<EChartsType | undefined>,
  containerRef: React.RefObject<HTMLDivElement>,
  chartModel: BaseCartesianChartModel,
  timelineEventsModel: TimelineEventsModel | null,
  option: EChartsOption,
  renderingContext: RenderingContext,
  {
    card,
    rawSeries,
    isVisualizerCard,
    visualizerRawSeries = [],
    selectedTimelineEventIds,
    settings,
    visualizationIsClickable,
    onChangeCardAndRun,
    onBrush,
    onVisualizationClick,
    onHoverChange,
    onOpenTimelines,
    onSelectTimelineEvents,
    onDeselectTimelineEvents,
    hovered,
    clicked,
    metadata,
    isDashboard,
  }: VisualizationProps,
) => {
  const isBrushing = useRef<boolean>();
  const hoveredRef = useRef(hovered);
  hoveredRef.current = hovered;

  useTooltipMouseLeave(chartRef, onHoverChange, containerRef);

  const onOpenQuestion = useCallback(
    (cardId?: CardId) => {
      if (isVisualizerCard) {
        const index = getVisualizerSeriesCardIndex(cardId);
        const nextCard = visualizerRawSeries[index].card;
        onChangeCardAndRun?.({ nextCard });
      } else {
        const nextCard =
          rawSeries.find((series) => series.card.id === cardId)?.card ?? card;
        onChangeCardAndRun?.({ nextCard });
      }
    },
    [
      card,
      rawSeries,
      visualizerRawSeries,
      isVisualizerCard,
      onChangeCardAndRun,
    ],
  );

  const isSplitPanels =
    settings["graph.split_panels"] === true &&
    chartModel.seriesModels.filter((series) => series.visible).length > 1;

  useChartYAxisVisibility({
    chartRef,
    seriesModels: chartModel.seriesModels,
    leftAxisModel: isSplitPanels ? null : chartModel.leftAxisModel,
    rightAxisModel: isSplitPanels ? null : chartModel.rightAxisModel,
    leftAxisSeriesKeys: chartModel.leftAxisModel?.seriesKeys ?? [],
    hovered,
  });

  const optionRef = useLatest(option);

  const eventHandlers: EChartsEventHandler[] = useMemo(
    () => [
      {
        eventName: "mouseout",
        query: "series",
        handler: () => {
          onHoverChange?.(null);
        },
      },
      {
        eventName: "mousemove",
        query: "series",
        handler: (event: EChartsSeriesMouseEvent) => {
          if (isBrushing.current) {
            return;
          }

          if (timelineEventsModel && event.name === TIMELINE_EVENT_DATA_NAME) {
            const eventData = getTimelineEventsHoverData(
              timelineEventsModel,
              event,
            );

            onHoverChange?.(eventData);
            return;
          }

          if (event.seriesId === GOAL_LINE_SERIES_ID) {
            const eventData = getGoalLineHoverData(
              settings,
              event,
              chartModel.leftAxisModel?.formatGoal,
            );

            onHoverChange?.(eventData);
            return;
          }

          const hoveredObject = getSeriesHovered(chartModel, event);
          const currentHovered = hoveredRef.current;
          const isSameDatumHovered =
            hoveredObject?.index === currentHovered?.index &&
            hoveredObject?.datumIndex === currentHovered?.datumIndex;

          if (!isSameDatumHovered) {
            onHoverChange?.(hoveredObject);
          }
        },
      },
      {
        eventName: "click",
        handler: (event: EChartsSeriesMouseEvent) => {
          const clickData = getSeriesClickData(chartModel, settings, event);

          if (timelineEventsModel && event.name === TIMELINE_EVENT_DATA_NAME) {
            onOpenTimelines?.();

            const clickedTimelineEvents = getTimelineEventsForEvent(
              timelineEventsModel,
              event,
            );

            if (!clickedTimelineEvents) {
              return;
            }

            if (
              hasSelectedTimelineEvents(
                clickedTimelineEvents,
                selectedTimelineEventIds ?? [],
              )
            ) {
              onDeselectTimelineEvents?.();
              return;
            }

            onSelectTimelineEvents?.(clickedTimelineEvents);
            return;
          }

          if (!visualizationIsClickable(clickData)) {
            onOpenQuestion(clickData?.cardId);
            return;
          }

          onVisualizationClick?.(clickData);
        },
      },
      {
        eventName: "brush",
        handler: (event: EChartsSeriesBrushEvent) => {
          if (!isBrushing.current) {
            chartRef.current?.setOption({ tooltip: { show: false } }, false);
            isBrushing.current = true;
          }

          const grids = getSplitPanelGrids(optionRef.current);
          const range = event.areas?.[0]?.range;
          if (grids && isLineXBrushRange(range)) {
            const graphics = buildBrushMirrorGraphics(
              grids,
              range,
              renderingContext,
            );
            chartRef.current?.setOption({ graphic: graphics }, false);
          }
        },
      },
      {
        eventName: "brushEnd",
        handler: (event: EChartsSeriesBrushEndEvent) => {
          const grids = getSplitPanelGrids(optionRef.current);
          if (grids) {
            const graphics = buildClearBrushMirrorGraphics(grids.length);
            chartRef.current?.setOption({ graphic: graphics }, false);
          }

          if (onBrush) {
            const range = event.areas[0]?.coordRange;
            if (range) {
              onBrush({ start: Number(range[0]), end: Number(range[1]) });
            }
          } else {
            const eventData = getBrushData(
              isVisualizerCard ? visualizerRawSeries : rawSeries,
              metadata,
              chartModel,
              event,
            );
            if (eventData) {
              onChangeCardAndRun?.(eventData);
            }
          }

          chartRef.current?.dispatchAction({
            type: "brush",
            command: "clear",
            areas: [],
          });
        },
      },
    ],
    [
      chartRef,
      onHoverChange,
      timelineEventsModel,
      chartModel,
      settings,
      visualizationIsClickable,
      onVisualizationClick,
      onOpenTimelines,
      selectedTimelineEventIds,
      onSelectTimelineEvents,
      onDeselectTimelineEvents,
      onOpenQuestion,
      optionRef,
      renderingContext,
      rawSeries,
      visualizerRawSeries,
      isVisualizerCard,
      metadata,
      onChangeCardAndRun,
      onBrush,
    ],
  );

  useEffect(
    function handleHoverStates() {
      const chart = chartRef.current;
      if (!chart) {
        return;
      }

      const { hoveredSeriesDataKey, hoveredEChartsSeriesIndex } =
        getHoveredEChartsSeriesDataKeyAndIndex(
          chartModel.seriesModels,
          option,
          hovered,
        );

      if (hovered == null || hoveredEChartsSeriesIndex == null) {
        return;
      }

      const { datumIndex: originalDatumIndex } = hovered;

      let dataIndex: number | undefined;

      const seriesModel = chartModel.seriesModels.find(
        (seriesModel) => seriesModel.dataKey === hoveredSeriesDataKey,
      );
      // If hovering a bar series, we highlight the entire series to ensure that
      // all the data labels show
      const isBarSeries =
        seriesModel != null
          ? settings.series?.(seriesModel.legacySeriesSettingsObjectKey)
              .display === "bar"
          : false;
      const shouldHighlightEntireSeries =
        isBarSeries && chartModel.seriesModels.length > 1;

      if (originalDatumIndex != null && !shouldHighlightEntireSeries) {
        // (issue #40215)
        // since some transformed datasets have indexes differing from
        // the original datasets indexes and ECharts uses the transformedDataset
        // for rendering, we need to figure out the correct transformedDataset's
        // index in order to highlight the correct element
        dataIndex = getTransformedDatumIndex(
          chartModel.transformedDataset,
          originalDatumIndex,
        );
      }

      chart.dispatchAction({
        type: "highlight",
        dataIndex,
        seriesIndex: hoveredEChartsSeriesIndex,
      });

      return () => {
        chart.dispatchAction({
          type: "downplay",
          dataIndex,
          seriesIndex: hoveredEChartsSeriesIndex,
        });
      };
    },
    [
      settings,
      chartModel.seriesModels,
      chartModel.transformedDataset,
      chartRef,
      hovered,
      option,
    ],
  );

  useClickedStateTooltipSync(chartRef.current, clicked);

  const canBrushChart = canBrush(
    rawSeries,
    settings,
    onChangeCardAndRun,
    onBrush,
  );
  const isBrushable = canBrushChart && !hovered && !clicked;

  useBrush(chartRef, containerRef, canBrushChart, isBrushable, option);

  const onSelectSeries = useCallback(
    (event: React.MouseEvent, seriesIndex: number) => {
      const areMultipleCards = rawSeries.length > 1;
      const seriesModel = chartModel.seriesModels[seriesIndex];

      if (areMultipleCards) {
        onOpenQuestion(seriesModel.cardId);
        return;
      }

      const hasBreakout = "breakoutColumn" in seriesModel;
      const dimensions = hasBreakout
        ? [
            {
              column: seriesModel.breakoutColumn,
              value: seriesModel.breakoutValue,
            },
          ]
        : undefined;

      const clickData = {
        cardId: seriesModel.cardId,
        dimensions,
        settings,
        element: event.currentTarget,
      };

      if (hasBreakout && visualizationIsClickable(clickData)) {
        onVisualizationClick(clickData);
      } else if (isDashboard) {
        onOpenQuestion(seriesModel.cardId);
      }
    },
    [
      chartModel.seriesModels,
      rawSeries,
      settings,
      visualizationIsClickable,
      onVisualizationClick,
      onOpenQuestion,
      isDashboard,
    ],
  );

  return {
    onSelectSeries,
    onOpenQuestion,
    eventHandlers,
  };
};

function getTransformedDatumIndex(
  transformedDataset: ChartDataset,
  originalDatumIndex: number,
) {
  const transformedDatumIndex = transformedDataset.findIndex(
    (datum) => datum[INDEX_KEY] === originalDatumIndex,
  );

  if (transformedDatumIndex === -1) {
    return originalDatumIndex;
  }

  return transformedDatumIndex;
}
