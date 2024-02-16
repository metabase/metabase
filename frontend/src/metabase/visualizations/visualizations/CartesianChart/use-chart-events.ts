import { useCallback, useEffect, useMemo, useRef } from "react";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";
import type {
  EChartsSeriesBrushEndEvent,
  EChartsSeriesMouseEvent,
} from "metabase/visualizations/echarts/types";
import {
  canBrush,
  getBrushData,
  getSeriesClickData,
  getSeriesHoverData,
  getTimelineEventsForEvent,
  getTimelineEventsHoverData,
  hasSelectedTimelineEvents,
} from "metabase/visualizations/visualizations/CartesianChart/events";
import type { LineSeriesOption } from "echarts/types/dist/echarts";
import type { EChartsOption, EChartsType } from "echarts";
import type * as React from "react";
import type { BaseCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";

export const useChartEvents = (
  chartRef: React.MutableRefObject<EChartsType | undefined>,
  chartModel: BaseCartesianChartModel,
  timelineEventsModel: TimelineEventsModel,
  option: EChartsOption,
  {
    card,
    rawSeries,
    selectedTimelineEventIds,
    settings,
    visualizationIsClickable,
    onChangeCardAndRun,
    onVisualizationClick,
    onHoverChange,
    onOpenTimelines,
    onSelectTimelineEvents,
    onDeselectTimelineEvents,
    hovered,
  }: VisualizationProps,
) => {
  const isBrushing = useRef<boolean>();

  const onOpenQuestion = useCallback(() => {
    if (onChangeCardAndRun) {
      onChangeCardAndRun({
        nextCard: card,
        seriesIndex: 0,
      });
    }
  }, [card, onChangeCardAndRun]);

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

          if (timelineEventsModel && event.name === "timeline-event") {
            const eventData = getTimelineEventsHoverData(
              timelineEventsModel,
              event,
            );

            onHoverChange?.(eventData);
            return;
          }

          onHoverChange?.(getSeriesHoverData(chartModel, settings, event));
        },
      },
      {
        eventName: "click",
        handler: (event: EChartsSeriesMouseEvent) => {
          const clickData = getSeriesClickData(chartModel, settings, event);

          if (timelineEventsModel && event.name === "timeline-event") {
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
            onOpenQuestion();
          }

          onVisualizationClick?.(clickData);
        },
      },
      {
        eventName: "brush",
        handler: () => {
          isBrushing.current = true;
        },
      },
      {
        eventName: "brushEnd",
        handler: (event: EChartsSeriesBrushEndEvent) => {
          const eventData = getBrushData(rawSeries, chartModel, event);

          if (eventData) {
            onChangeCardAndRun(eventData);
          }
        },
      },
    ],
    [
      chartModel,
      onOpenQuestion,
      rawSeries,
      selectedTimelineEventIds,
      settings,
      timelineEventsModel,
      visualizationIsClickable,
      onChangeCardAndRun,
      onVisualizationClick,
      onHoverChange,
      onOpenTimelines,
      onSelectTimelineEvents,
      onDeselectTimelineEvents,
    ],
  );

  useEffect(
    function handleHoverStates() {
      const chart = chartRef.current;
      if (!chart) {
        return;
      }

      if (hovered?.index == null) {
        return;
      }

      const { datumIndex, index } = hovered;
      const seriesId = chartModel.seriesModels[index].dataKey;

      // ECharts series contain goal line, trend lines, and timeline events so the series index
      // is different from one in chartModel.seriesModels
      const eChartsSeriesIndex = (
        option?.series as LineSeriesOption[]
      ).findIndex(series => series.id === seriesId);

      chart.dispatchAction({
        type: "highlight",
        dataIndex: datumIndex,
        seriesIndex: eChartsSeriesIndex,
      });

      return () => {
        chart.dispatchAction({
          type: "downplay",
          dataIndex: datumIndex,
          seriesIndex: eChartsSeriesIndex,
        });
      };
    },
    [chartModel.seriesModels, hovered, option?.series],
  );

  // In order to keep brushing always enabled we have to re-enable it on every model change
  useEffect(
    function enableBrushing() {
      if (!canBrush(rawSeries, settings, onChangeCardAndRun)) {
        return;
      }

      setTimeout(() => {
        chartRef.current?.dispatchAction({
          type: "takeGlobalCursor",
          key: "brush",
          brushOption: {
            brushType: "lineX",
            brushMode: "single",
          },
        });
      }, 0);
    },
    [onChangeCardAndRun, option, rawSeries, settings],
  );

  const onSelectSeries = useCallback(
    (event: React.MouseEvent, seriesIndex: number) => {
      const seriesModel = chartModel.seriesModels[seriesIndex];
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
        column: seriesModel.column,
        dimensions,
        settings,
      };

      if (hasBreakout && visualizationIsClickable(clickData)) {
        onVisualizationClick({
          ...clickData,
          element: event.currentTarget,
        });
      } else {
        onOpenQuestion();
      }
    },
    [
      chartModel.seriesModels,
      onVisualizationClick,
      onOpenQuestion,
      settings,
      visualizationIsClickable,
    ],
  );

  return {
    onSelectSeries,
    onOpenQuestion,
    eventHandlers,
  };
};
