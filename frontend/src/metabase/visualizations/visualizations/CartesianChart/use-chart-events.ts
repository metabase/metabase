import type { EChartsOption } from "echarts";
import type { EChartsType } from "echarts/core";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLatest } from "react-use";

import { CLICKED_DATA_POINT_HIGHLIGHT_DURATION } from "metabase/visualizations/constants";
import {
  GOAL_LINE_SERIES_ID,
  INDEX_KEY,
  TIMELINE_EVENT_DATA_NAME,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import type {
  BaseCartesianChartModel,
  ChartDataset,
  DataKey,
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
import {
  MENTION_HIGHLIGHT_CONTRACT_DURATION,
  MENTION_HIGHLIGHT_CONTRACT_EASING,
} from "metabase/visualizations/lib/mention-highlight";
import type {
  RenderingContext,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";
import {
  canBrush,
  getBrushData,
  getClickedDataPoint,
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
import {
  getEChartsSeriesIndexByDataKey,
  getHoveredEChartsSeriesDataKeyAndIndex,
} from "./utils";

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
    clickedViaMention,
    clickedViaMentionGroup,
    metadata,
    isDashboard,
  }: VisualizationProps,
) => {
  const isBrushing = useRef<boolean>();
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
  // The data-point highlight effects below read the chart model/option/context
  // from these refs so they only re-run when the *selection* changes — not on
  // every re-render that produces new model/option references. Re-running on
  // those would visibly clear and re-apply the highlight (a flash).
  const chartModelRef = useLatest(chartModel);
  const renderingContextRef = useLatest(renderingContext);

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
      hovered,
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

  useClickedStateTooltipSync(chartRef.current, clickedViaMention ?? clicked);

  useEffect(
    function handleClickedStateHighlight() {
      const chart = chartRef.current;
      const chartModel = chartModelRef.current;
      const option = optionRef.current;
      const renderingContext = renderingContextRef.current;
      const activeClicked = clickedViaMention ?? clicked;
      const isClickedViaMention = clickedViaMention != null;
      if (!chart || activeClicked == null) {
        return;
      }

      const clickedDataPoint = getClickedDataPoint(chartModel, activeClicked);
      if (clickedDataPoint == null) {
        return;
      }

      const seriesDataKey =
        chartModel.seriesModels[clickedDataPoint.seriesIndex]?.dataKey;
      if (seriesDataKey == null) {
        return;
      }

      const eChartsSeriesIndex = getEChartsSeriesIndexByDataKey(
        option,
        seriesDataKey,
      );
      if (eChartsSeriesIndex < 0) {
        return;
      }

      const dataIndex = getTransformedDatumIndex(
        chartModel.transformedDataset,
        clickedDataPoint.datumIndex,
      );

      const optionSeries = Array.isArray(option.series)
        ? option.series
        : [option.series].filter(Boolean);
      const selectedOptionSeries = optionSeries[eChartsSeriesIndex];
      const selectedSeriesType = selectedOptionSeries?.type;
      const shouldDimSeries = ["bar", "line", "scatter"].includes(
        String(selectedSeriesType),
      );

      const mentionHighlightColor = renderingContext.getColor("brand");
      const defaultHighlightColor = renderingContext.getColor("brand");
      const defaultShadowColor =
        selectedSeriesType === "line"
          ? defaultHighlightColor
          : renderingContext.getColor("background-primary");

      // Data series keys for this chart, excluding non-data series like goal or
      // trend lines (those aren't backed by a series model).
      const dataSeriesKeys = chartModel.seriesModels
        .filter((seriesModel) => seriesModel.visible)
        .map((seriesModel) => seriesModel.dataKey);
      // In a multi-series chart each series is a separate line/area, so we keep
      // the selected series prominent and dim the OTHER series. In a single-series
      // chart (one series with many points, e.g. a bar chart broken out by
      // category) there are no other series, so we dim the selected series itself
      // and re-emphasize the clicked point via its selected state.
      const isMultiSeries = dataSeriesKeys.length > 1;
      const otherSeriesKeys = dataSeriesKeys.filter(
        (key) => key !== seriesDataKey,
      );

      if (isClickedViaMention && shouldDimSeries) {
        chart.setOption(
          {
            series: [
              {
                id: seriesDataKey,
                select: {
                  itemStyle: {
                    borderColor: mentionHighlightColor,
                    shadowColor: mentionHighlightColor,
                  },
                },
              },
            ],
          },
          false,
        );
      }

      if (shouldDimSeries) {
        chart.setOption(
          {
            series: isMultiSeries
              ? otherSeriesKeys.map((id) => ({
                  id,
                  lineStyle: { opacity: CHART_STYLE.opacity.blur },
                  itemStyle: { opacity: CHART_STYLE.opacity.blur },
                }))
              : [
                  {
                    id: seriesDataKey,
                    ...(selectedSeriesType === "line"
                      ? {
                          lineStyle: { opacity: CHART_STYLE.opacity.blur },
                          itemStyle: { opacity: CHART_STYLE.opacity.blur },
                        }
                      : {
                          itemStyle: { opacity: CHART_STYLE.opacity.blur },
                        }),
                  },
                ],
          },
          false,
        );
      }

      chart.dispatchAction({
        type: "select",
        dataIndex,
        seriesIndex: eChartsSeriesIndex,
      });

      animateMentionContract(chart, {
        seriesIndex: eChartsSeriesIndex,
        dataIndex,
        value: Number(
          chartModel.transformedDataset[dataIndex]?.[seriesDataKey],
        ),
        seriesType: String(selectedSeriesType),
        color: mentionHighlightColor,
      });

      const clearHighlight = () => {
        chart.dispatchAction({
          type: "unselect",
          dataIndex,
          seriesIndex: eChartsSeriesIndex,
        });
        if (shouldDimSeries) {
          const restoreSelectStyle = isClickedViaMention
            ? {
                itemStyle: {
                  borderColor: defaultHighlightColor,
                  shadowColor: defaultShadowColor,
                },
              }
            : undefined;

          chart.setOption(
            {
              series: isMultiSeries
                ? [
                    { id: seriesDataKey, select: restoreSelectStyle },
                    ...otherSeriesKeys.map((id) => ({
                      id,
                      lineStyle: { opacity: 1 },
                      itemStyle: { opacity: 1 },
                    })),
                  ]
                : [
                    {
                      id: seriesDataKey,
                      select: restoreSelectStyle,
                      ...(selectedSeriesType === "line"
                        ? {
                            lineStyle: { opacity: 1 },
                            itemStyle: { opacity: 1 },
                          }
                        : {
                            itemStyle: {
                              opacity:
                                selectedSeriesType === "scatter"
                                  ? CHART_STYLE.opacity.scatter
                                  : 1,
                            },
                          }),
                    },
                  ],
            },
            false,
          );
        }
      };

      const timeoutId = window.setTimeout(
        clearHighlight,
        CLICKED_DATA_POINT_HIGHLIGHT_DURATION,
      );

      return () => {
        window.clearTimeout(timeoutId);
        clearHighlight();
      };
    },
    [
      chartRef,
      chartModelRef,
      optionRef,
      renderingContextRef,
      clicked,
      clickedViaMention,
    ],
  );

  useEffect(
    function handleMentionGroupHighlight() {
      const chart = chartRef.current;
      const chartModel = chartModelRef.current;
      const option = optionRef.current;
      const renderingContext = renderingContextRef.current;
      if (!chart || !clickedViaMentionGroup?.length) {
        return;
      }

      const optionSeries = Array.isArray(option.series)
        ? option.series
        : [option.series].filter(Boolean);

      // Resolve every clicked point to its (ECharts series, data index), grouped by series so we can
      // dim a series once and select all of its highlighted points in a single dispatch.
      const selectionsBySeries = new Map<
        number,
        { seriesDataKey: DataKey; seriesType?: string; dataIndices: number[] }
      >();

      for (const clickedItem of clickedViaMentionGroup) {
        const clickedDataPoint = getClickedDataPoint(chartModel, clickedItem);
        if (clickedDataPoint == null) {
          continue;
        }

        const seriesDataKey =
          chartModel.seriesModels[clickedDataPoint.seriesIndex]?.dataKey;
        if (seriesDataKey == null) {
          continue;
        }

        const eChartsSeriesIndex = getEChartsSeriesIndexByDataKey(
          option,
          seriesDataKey,
        );
        if (eChartsSeriesIndex < 0) {
          continue;
        }

        const dataIndex = getTransformedDatumIndex(
          chartModel.transformedDataset,
          clickedDataPoint.datumIndex,
        );

        const existing = selectionsBySeries.get(eChartsSeriesIndex);
        if (existing) {
          existing.dataIndices.push(dataIndex);
        } else {
          selectionsBySeries.set(eChartsSeriesIndex, {
            seriesDataKey,
            seriesType: optionSeries[eChartsSeriesIndex]?.type,
            dataIndices: [dataIndex],
          });
        }
      }

      if (selectionsBySeries.size === 0) {
        return;
      }

      const mentionHighlightColor = renderingContext.getColor("brand");

      const canDim = (seriesType?: string) =>
        ["bar", "line", "scatter"].includes(String(seriesType));

      selectionsBySeries.forEach(
        ({ seriesDataKey, seriesType, dataIndices }, eChartsSeriesIndex) => {
          if (canDim(seriesType)) {
            chart.setOption(
              {
                series: [
                  {
                    id: seriesDataKey,
                    select: {
                      itemStyle: {
                        borderColor: mentionHighlightColor,
                        shadowColor: mentionHighlightColor,
                      },
                    },
                    ...(seriesType === "line"
                      ? {
                          lineStyle: { opacity: CHART_STYLE.opacity.blur },
                          itemStyle: { opacity: CHART_STYLE.opacity.blur },
                        }
                      : { itemStyle: { opacity: CHART_STYLE.opacity.blur } }),
                  },
                ],
              },
              false,
            );
          }

          chart.dispatchAction({
            type: "select",
            seriesIndex: eChartsSeriesIndex,
            dataIndex: dataIndices,
          });

          dataIndices.forEach((dataIndex) => {
            animateMentionContract(chart, {
              seriesIndex: eChartsSeriesIndex,
              dataIndex,
              value: Number(
                chartModel.transformedDataset[dataIndex]?.[seriesDataKey],
              ),
              seriesType: String(seriesType),
              color: mentionHighlightColor,
            });
          });
        },
      );

      return () => {
        selectionsBySeries.forEach(
          ({ seriesDataKey, seriesType, dataIndices }, eChartsSeriesIndex) => {
            chart.dispatchAction({
              type: "unselect",
              seriesIndex: eChartsSeriesIndex,
              dataIndex: dataIndices,
            });

            if (canDim(seriesType)) {
              chart.setOption(
                {
                  series: [
                    {
                      id: seriesDataKey,
                      select: undefined,
                      ...(seriesType === "line"
                        ? {
                            lineStyle: { opacity: 1 },
                            itemStyle: { opacity: 1 },
                          }
                        : {
                            itemStyle: {
                              opacity:
                                seriesType === "scatter"
                                  ? CHART_STYLE.opacity.scatter
                                  : 1,
                            },
                          }),
                    },
                  ],
                },
                false,
              );
            }
          },
        );
      };
    },
    [
      chartRef,
      chartModelRef,
      optionRef,
      renderingContextRef,
      clickedViaMentionGroup,
    ],
  );

  const canBrushChart = canBrush(
    rawSeries,
    settings,
    onChangeCardAndRun,
    onBrush,
  );
  const isBrushable =
    canBrushChart && !hovered && !clicked && !clickedViaMention;

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

let mentionRingCounter = 0;

// Plays the "contract onto the element" entrance for a highlighted data point.
// For bars the highlight border itself starts thick (extending past the bar)
// and tightens onto the bar; for line/scatter points (which are dots) a ring
// contracts onto the point. The persistent select border remains either way.
function animateMentionContract(
  chart: EChartsType,
  {
    seriesIndex,
    dataIndex,
    value,
    seriesType,
    color,
  }: {
    seriesIndex: number;
    dataIndex: number;
    value: number;
    seriesType: string;
    color: string;
  },
) {
  if (!Number.isFinite(value)) {
    return;
  }

  const pixel = chart.convertToPixel({ seriesIndex }, [dataIndex, value]) as
    | number[]
    | null;
  if (pixel == null || pixel.some((coord) => !Number.isFinite(coord))) {
    return;
  }

  const [cx, cy] = pixel;

  if (seriesType === "bar") {
    animateBarBorderContract(chart, cx, cy);
    return;
  }

  animatePointRingContract(chart, cx, cy, color);
}

// Tightens the selected bar's border from thick to its resting width, so the
// highlight appears to contract onto the bar. Locates the bar's rendered SVG
// path via its pixel position and animates that path's stroke directly.
function animateBarBorderContract(
  chart: EChartsType,
  cx: number,
  barTopY: number,
) {
  window.requestAnimationFrame(() => {
    if (chart.isDisposed()) {
      return;
    }
    const dom = chart.getDom();
    const rect = dom.getBoundingClientRect();
    // Sample a little below the bar's top edge so we land on the bar body.
    const el = document.elementFromPoint(
      rect.left + cx,
      rect.top + barTopY + 6,
    );
    if (
      el == null ||
      !dom.contains(el) ||
      !(el instanceof SVGElement) ||
      typeof el.animate !== "function"
    ) {
      return;
    }
    el.animate(
      [
        { strokeWidth: "8px", offset: 0 },
        { strokeWidth: "2px", offset: 1 },
      ],
      {
        duration: MENTION_HIGHLIGHT_CONTRACT_DURATION,
        easing: MENTION_HIGHLIGHT_CONTRACT_EASING,
      },
    );
  });
}

// Contracts a brand ring onto a line/scatter point, then fades it out, leaving
// the persistent select styling behind.
function animatePointRingContract(
  chart: EChartsType,
  cx: number,
  cy: number,
  color: string,
) {
  const id = `mention-contract-ring-${mentionRingCounter++}`;
  const restRadius = 12;

  chart.setOption(
    {
      graphic: [
        {
          id,
          type: "circle",
          z: 1000,
          silent: true,
          shape: { cx, cy, r: restRadius },
          style: { fill: "none", stroke: color, lineWidth: 2 },
          originX: cx,
          originY: cy,
          scaleX: 1,
          scaleY: 1,
          transition: ["scaleX", "scaleY", "style"],
          transitionDuration: MENTION_HIGHLIGHT_CONTRACT_DURATION / 1000,
          enterFrom: { scaleX: 2.5, scaleY: 2.5, style: { opacity: 0 } },
        },
      ],
    },
    false,
  );

  window.setTimeout(() => {
    if (chart.isDisposed()) {
      return;
    }
    chart.setOption(
      {
        graphic: [
          {
            id,
            scaleX: 0.6,
            scaleY: 0.6,
            style: { opacity: 0 },
            transition: ["scaleX", "scaleY", "style"],
            transitionDuration: MENTION_HIGHLIGHT_CONTRACT_DURATION / 1000,
          },
        ],
      },
      false,
    );
    window.setTimeout(() => {
      if (!chart.isDisposed()) {
        chart.setOption({ graphic: [{ id, $action: "remove" }] }, false);
      }
    }, MENTION_HIGHLIGHT_CONTRACT_DURATION);
  }, MENTION_HIGHLIGHT_CONTRACT_DURATION);
}

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
