import type { EChartsCoreOption, EChartsType } from "echarts/core";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  GOAL_LINE_SERIES_ID,
  INDEX_KEY,
  TIMELINE_EVENT_DATA_NAME,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import type {
  BaseCartesianChartModel,
  ChartDataset,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { createAxisVisibilityOption } from "metabase/visualizations/echarts/cartesian/option/axis";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
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
import { getVisualizerSeriesCardIndex } from "metabase/visualizer/utils";
import type { CardId } from "metabase-types/api";

import {
  type SeriesDatum,
  getHoveredEChartsSeriesDataKeyAndIndex,
  getHoveredSeriesDataKey,
  getSeriesDatumFromEvent,
} from "./utils";

export const useChartEvents = (
  chartRef: React.MutableRefObject<EChartsType | undefined>,
  chartModel: BaseCartesianChartModel,
  timelineEventsModel: TimelineEventsModel | null,
  option: EChartsCoreOption,
  {
    card,
    rawSeries,
    isVisualizerViz,
    visualizerRawSeries = [],
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
  const isBrushing = useRef<boolean>(false);
  const lastTimelineHover = useRef<SeriesDatum | null>(null);
  const clickedRef = useRef(!!clicked);
  useEffect(() => {
    clickedRef.current = !!clicked;
  }, [clicked]);
  const hoveredRef = useRef(hovered);
  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);
  const optionRef = useRef(option);
  useEffect(() => {
    optionRef.current = option;
  }, [option]);

  const onOpenQuestion = useCallback(
    (cardId?: CardId) => {
      if (isVisualizerViz) {
        const index = getVisualizerSeriesCardIndex(cardId);
        const nextCard = visualizerRawSeries[index].card;
        onChangeCardAndRun?.({ nextCard });
      } else {
        const nextCard =
          rawSeries.find((series) => series.card.id === cardId)?.card ?? card;
        onChangeCardAndRun?.({ nextCard });
      }
    },
    [isVisualizerViz, visualizerRawSeries, onChangeCardAndRun, rawSeries, card],
  );

  const hoveredSeriesDataKey = useMemo(
    () => getHoveredSeriesDataKey(chartModel.seriesModels, hoveredRef.current),
    [chartModel.seriesModels],
  );

  /**
   * Interaction updates must not call chart.setOption().
   * We use dispatchAction for hover/click/brush to avoid ECharts rebuilds.
   * The only setOption here is Y-axis visibility, deferred via rAF so it
   * cannot collide with renderer setOption calls. If you add new setOption
   * calls, defer them (rAF) or they may race.
   */
  useEffect(
    function updateYAxisVisibility() {
      if (clickedRef.current) {
        return;
      }

      const hasSingleYAxis = !(
        chartModel.leftAxisModel != null && chartModel.rightAxisModel != null
      );

      if (hasSingleYAxis) {
        return;
      }

      let yAxisShowOption: ReturnType<typeof createAxisVisibilityOption>[];

      const noSeriesHovered = hoveredSeriesDataKey == null;
      const leftAxisSeriesHovered =
        hoveredSeriesDataKey != null &&
        chartModel.leftAxisModel?.seriesKeys.includes(hoveredSeriesDataKey);

      if (noSeriesHovered) {
        yAxisShowOption = [
          createAxisVisibilityOption({ show: true, splitLineVisible: true }),
          createAxisVisibilityOption({ show: true, splitLineVisible: false }),
        ];
      } else if (leftAxisSeriesHovered) {
        yAxisShowOption = [
          createAxisVisibilityOption({ show: true, splitLineVisible: true }),
          createAxisVisibilityOption({ show: false, splitLineVisible: false }),
        ];
      } else {
        // right axis series hovered
        yAxisShowOption = [
          createAxisVisibilityOption({ show: false, splitLineVisible: false }),
          createAxisVisibilityOption({ show: true, splitLineVisible: true }),
        ];
      }

      const chart = chartRef.current;
      const raf = requestAnimationFrame(() => {
        chart?.setOption(
          { yAxis: yAxisShowOption },
          {
            notMerge: false,
            lazyUpdate: true,
            silent: true,
            replaceMerge: ["yAxis"],
          },
        );
      });
      return () => cancelAnimationFrame(raf);
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
          if (!clickedRef.current) {
            onHoverChange?.(null);

            const chart = chartRef.current;

            if (chart && lastTimelineHover.current) {
              chart.dispatchAction({
                type: "downplay",
                ...lastTimelineHover.current,
              });
              lastTimelineHover.current = null;
            }
          }
        },
      },
      {
        eventName: "mousemove",
        query: "series",
        handler: (event: EChartsSeriesMouseEvent) => {
          if (isBrushing.current || clickedRef.current) {
            return;
          }

          if (timelineEventsModel && event.name === TIMELINE_EVENT_DATA_NAME) {
            const chart = chartRef.current;

            if (chart) {
              const cur = getSeriesDatumFromEvent(optionRef.current, event);
              if (!cur) {
                return;
              }

              if (lastTimelineHover.current) {
                chart.dispatchAction({
                  type: "downplay",
                  ...lastTimelineHover.current,
                });
              }
              chart.dispatchAction({ type: "highlight", ...cur });
              lastTimelineHover.current = cur;
            }

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
          const prev = hoveredRef.current;
          const isSameDatumHovered =
            hoveredObject?.index === prev?.index &&
            hoveredObject?.datumIndex === prev?.datumIndex;

          if (!isSameDatumHovered) {
            onHoverChange?.(hoveredObject);
          }
        },
      },
      {
        eventName: "click",
        handler: (event: EChartsSeriesMouseEvent) => {
          if (isBrushing.current) {
            return;
          }

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

          if (visualizationIsClickable(clickData)) {
            onVisualizationClick?.(clickData);
          } else {
            onOpenQuestion(clickData?.cardId);
          }
        },
      },
      {
        eventName: "brush",
        handler: () => {
          if (!isBrushing.current) {
            chartRef.current?.dispatchAction({ type: "hideTip" });
            isBrushing.current = true;
          }
        },
      },
      {
        eventName: "brushEnd",
        handler: (event: EChartsSeriesBrushEndEvent) => {
          const eventData = getBrushData(
            isVisualizerViz ? visualizerRawSeries : rawSeries,
            metadata,
            chartModel,
            event,
          );

          if (eventData) {
            onChangeCardAndRun?.(eventData);
          }

          isBrushing.current = false;
        },
      },
    ],
    [
      onHoverChange,
      chartRef,
      timelineEventsModel,
      chartModel,
      settings,
      visualizationIsClickable,
      onOpenTimelines,
      selectedTimelineEventIds,
      onSelectTimelineEvents,
      onDeselectTimelineEvents,
      onVisualizationClick,
      onOpenQuestion,
      isVisualizerViz,
      visualizerRawSeries,
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

      if (clickedRef.current) {
        return;
      }

      const { hoveredSeriesDataKey, hoveredEChartsSeriesIndex } =
        getHoveredEChartsSeriesDataKeyAndIndex(
          chartModel.seriesModels,
          option,
          hoveredRef.current,
        );

      if (hoveredRef.current == null || hoveredEChartsSeriesIndex == null) {
        return;
      }

      const { datumIndex: originalDatumIndex } = hoveredRef.current;

      let dataIndex: number | undefined;

      const seriesModel = chartModel.seriesModels.find(
        (seriesModel) => seriesModel.dataKey === hoveredSeriesDataKey,
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
      option,
    ],
  );

  const brushEnabledRef = useRef<boolean | null>(null);

  // In order to keep brushing always enabled we have to re-enable it on every model change
  useEffect(
    function toggleBrushing() {
      const shouldEnableBrushing =
        canBrush(rawSeries, settings, onChangeCardAndRun) &&
        !clickedRef.current;

      const chart = chartRef.current;
      if (!chart) {
        return;
      }

      if (brushEnabledRef.current === shouldEnableBrushing) {
        return;
      }
      brushEnabledRef.current = shouldEnableBrushing;

      if (shouldEnableBrushing) {
        chart.dispatchAction({
          type: "takeGlobalCursor",
          key: "brush",
          brushOption: { brushType: "lineX", brushMode: "single" },
        });
      } else {
        chart.dispatchAction({ type: "takeGlobalCursor" });
      }
    },
    [chartRef, onChangeCardAndRun, rawSeries, settings, clicked],
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
    (datum) => datum[INDEX_KEY] === originalDatumIndex,
  );

  if (transformedDatumIndex === -1) {
    return originalDatumIndex;
  }

  return transformedDatumIndex;
}
