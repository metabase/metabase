import type { EChartsCoreOption, EChartsType } from "echarts/core";
import type * as React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import {
  GOAL_LINE_SERIES_ID,
  ORIGINAL_INDEX_DATA_KEY,
  TIMELINE_EVENT_DATA_NAME,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  BaseCartesianChartModel,
  ChartDataset,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import { useClickedStateTooltipSync } from "metabase/visualizations/echarts/tooltip";
import type {
  EChartsSeriesBrushEndEvent,
  EChartsSeriesMouseEvent,
} from "metabase/visualizations/echarts/types";
import type { VisualizationProps } from "metabase/visualizations/types";
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
import type { CardId } from "metabase-types/api";

import {
  getHoveredEChartsSeriesDataKeyAndIndex,
  getHoveredSeriesDataKey,
} from "./utils";

export const useChartEvents = (
  chartRef: React.MutableRefObject<EChartsType | undefined>,
  chartModel: BaseCartesianChartModel,
  timelineEventsModel: TimelineEventsModel | null,
  option: EChartsCoreOption,
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
    clicked,
    metadata,
    isDashboard,
  }: VisualizationProps,
) => {
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

  const hoveredSeriesDataKey = useMemo(
    () => getHoveredSeriesDataKey(chartModel.seriesModels, hovered),
    [chartModel.seriesModels, hovered],
  );

  /**
   * We intentionally use useLayoutEffect here and not useEffect.
   * This is so that chart.setOption is always called in a different tick than
   * chart.setOption from useClickedStateTooltipSync. If they're called in the
   * same tick (which may happen non-deterministically), then the 2nd chart.setOption
   * call (whichever is 2nd) will throw "Cannot read property 'coordinateSystem' of undefined" error.
   */
  useLayoutEffect(
    function updateYAxisVisibility() {
      const hasSingleYAxis = !(
        chartModel.leftAxisModel != null && chartModel.rightAxisModel != null
      );

      if (hasSingleYAxis) {
        return;
      }

      const yAxisShowOption = [{ show: true }, { show: true }];
      if (hoveredSeriesDataKey != null) {
        const hiddenYAxisIndex = chartModel.leftAxisModel?.seriesKeys.includes(
          hoveredSeriesDataKey,
        )
          ? 1
          : 0;

        yAxisShowOption[hiddenYAxisIndex].show = false;
      }

      chartRef.current?.setOption({ yAxis: yAxisShowOption }, false, true);
    },
    [
      chartModel.leftAxisModel,
      chartModel.rightAxisModel,
      chartRef,
      hoveredSeriesDataKey,
    ],
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

          if (timelineEventsModel && event.name === TIMELINE_EVENT_DATA_NAME) {
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

          const hoveredObject = getSeriesHovered(chartModel, event);
          const isSameDatumHovered =
            hoveredObject?.index === hovered?.index &&
            hoveredObject?.datumIndex === hovered?.datumIndex;

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
          }

          onVisualizationClick?.(clickData);
        },
      },
      {
        eventName: "brush",
        handler: () => {
          if (!isBrushing.current) {
            chartRef.current?.setOption({ tooltip: { show: false } }, false);
            isBrushing.current = true;
          }
        },
      },
      {
        eventName: "brushEnd",
        handler: (event: EChartsSeriesBrushEndEvent) => {
          const eventData = getBrushData(
            rawSeries,
            metadata,
            chartModel,
            event,
          );

          if (eventData) {
            onChangeCardAndRun(eventData);
          }
        },
      },
    ],
    [
      chartRef,
      onHoverChange,
      timelineEventsModel,
      chartModel,
      hovered,
      settings,
      visualizationIsClickable,
      onVisualizationClick,
      onOpenTimelines,
      selectedTimelineEventIds,
      onSelectTimelineEvents,
      onDeselectTimelineEvents,
      onOpenQuestion,
      rawSeries,
      metadata,
      onChangeCardAndRun,
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
        seriesModel => seriesModel.dataKey === hoveredSeriesDataKey,
      );
      // If hovering a bar series, we highlight the entire series to ensure that
      // all the data labels show
      const isBarSeries =
        seriesModel != null
          ? settings.series(seriesModel.legacySeriesSettingsObjectKey)
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

  // In order to keep brushing always enabled we have to re-enable it on every model change
  useEffect(
    function toggleBrushing() {
      const shouldEnableBrushing =
        canBrush(rawSeries, settings, onChangeCardAndRun) &&
        !hovered &&
        !clicked;

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
    [
      chartRef,
      hovered,
      onChangeCardAndRun,
      option,
      rawSeries,
      settings,
      clicked,
    ],
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

      if (hasBreakout && visualizationIsClickable(clickData)) {
        onVisualizationClick({
          ...clickData,
          element: event.currentTarget,
        });
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
    datum => datum[ORIGINAL_INDEX_DATA_KEY] === originalDatumIndex,
  );

  if (transformedDatumIndex === -1) {
    return originalDatumIndex;
  }

  return transformedDatumIndex;
}
