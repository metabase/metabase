import type { EChartsOption, EChartsType } from "echarts";
import type { LineSeriesOption } from "echarts/types/dist/echarts";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  GOAL_LINE_SERIES_ID,
  ORIGINAL_INDEX_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  BaseCartesianChartModel,
  ChartDataset,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type {
  EChartsSeriesBrushEndEvent,
  EChartsSeriesMouseEvent,
} from "metabase/visualizations/echarts/types";
import type {
  ClickObject,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";
import {
  canBrush,
  getBrushData,
  getGoalLineHoverData,
  getSeriesClickData,
  getSeriesHoverData,
  getTimelineEventsForEvent,
  getTimelineEventsHoverData,
  hasSelectedTimelineEvents,
} from "metabase/visualizations/visualizations/CartesianChart/events";
import type { CardId } from "metabase-types/api";

export const useChartEvents = (
  chartRef: React.MutableRefObject<EChartsType | undefined>,
  chartModel: BaseCartesianChartModel,
  timelineEventsModel: TimelineEventsModel | null,
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
): ClickObject => {
  const isBrushing = useRef<boolean>();

  const onOpenQuestion = useCallback(
    (cardId?: CardId) => {
      const nextCard =
        rawSeries.find(series => series.card.id === cardId)?.card ?? card;
      if (onChangeCardAndRun) {
        onChangeCardAndRun({
          nextCard,
        });
      }
    },
    [card, onChangeCardAndRun, rawSeries],
  );

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

          if (event.seriesId === GOAL_LINE_SERIES_ID) {
            const eventData = getGoalLineHoverData(settings, event);

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
            onOpenQuestion(clickData?.cardId);
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

      const { datumIndex: originalDatumIndex, index } = hovered;
      const hoveredSeries = chartModel.seriesModels[index];
      if (!hoveredSeries) {
        return;
      }

      // ECharts series contain goal line, trend lines, and timeline events so the series index
      // is different from one in chartModel.seriesModels
      const eChartsSeriesIndex = (
        option?.series as LineSeriesOption[]
      ).findIndex(series => series.id === hoveredSeries.dataKey);

      let dataIndex: number | undefined;

      if (originalDatumIndex != null) {
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
        seriesIndex: eChartsSeriesIndex,
      });

      return () => {
        chart.dispatchAction({
          type: "downplay",
          dataIndex,
          seriesIndex: eChartsSeriesIndex,
        });
      };
    },
    [
      chartModel.seriesModels,
      chartModel.transformedDataset,
      chartRef,
      hovered,
      option?.series,
    ],
  );

  // In order to keep brushing always enabled we have to re-enable it on every model change
  useEffect(
    function enableBrushing() {
      const shouldEnableBrushing =
        canBrush(rawSeries, settings, onChangeCardAndRun) && !hovered;

      setTimeout(() => {
        if (shouldEnableBrushing) {
          chartRef.current?.dispatchAction({
            type: "takeGlobalCursor",
            key: "brush",
            brushOption: {
              brushType: "lineX",
              brushMode: "single",
            },
          });
        } else {
          chartRef.current?.dispatchAction({
            type: "takeGlobalCursor",
          });
        }
      }, 0);
    },
    [chartRef, hovered, onChangeCardAndRun, option, rawSeries, settings],
  );

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
      };

      if (
        !areMultipleCards &&
        hasBreakout &&
        visualizationIsClickable(clickData)
      ) {
        onVisualizationClick({
          ...clickData,
          element: event.currentTarget,
        });
      } else {
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
    datum => datum[ORIGINAL_INDEX_DATA_KEY] === originalDatumIndex,
  );

  if (transformedDatumIndex === -1) {
    return originalDatumIndex;
  }

  return transformedDatumIndex;
}
