import { useCallback, useEffect, useMemo, useRef } from "react";
import type { EChartsType } from "echarts";
import type * as React from "react";
import type { LineSeriesOption } from "echarts/types/dist/echarts";
import type { VisualizationProps } from "metabase/visualizations/types";
import {
  CartesianChartLegendLayout,
  CartesianChartRenderer,
  CartesianChartRoot,
} from "metabase/visualizations/visualizations/CartesianChart/CartesianChart.styled";
import LegendCaption from "metabase/visualizations/components/legend/LegendCaption";
import { getLegendItems } from "metabase/visualizations/echarts/cartesian/model/legend";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";
import {
  canBrush,
  getBrushData,
  getSeriesClickData,
  getSeriesHoverData,
  getTimelineEventsForEvent,
  getTimelineEventsHoverData,
  hasSelectedTimelineEvents,
} from "metabase/visualizations/visualizations/CartesianChart/events";
import type {
  EChartsSeriesBrushEndEvent,
  EChartsSeriesMouseEvent,
} from "metabase/visualizations/echarts/types";
import { getSeriesIdFromECharts } from "metabase/visualizations/echarts/cartesian/utils/id";
import { useModelsAndOption } from "./use-models-and-option";
import { useChartDebug } from "./use-chart-debug";

export function CartesianChart(props: VisualizationProps) {
  const {
    rawSeries,
    settings,
    card,
    width,
    showTitle,
    headerIcon,
    actionButtons,
    isQueryBuilder,
    isFullscreen,
    selectedTimelineEventIds,
    hovered,
    visualizationIsClickable,
    onChangeCardAndRun,
    onHoverChange,
    onVisualizationClick,
    onSelectTimelineEvents,
    onDeselectTimelineEvents,
    onOpenTimelines,
  } = props;
  const { chartModel, timelineEventsModel, option } = useModelsAndOption(props);
  useChartDebug({ isQueryBuilder, rawSeries, option });

  const isBrushing = useRef<boolean>();
  const chartRef = useRef<EChartsType>();

  const hasTitle = showTitle && settings["card.title"];
  const title = settings["card.title"] || card.name;
  const description = settings["card.description"];

  const legendItems = useMemo(() => getLegendItems(chartModel), [chartModel]);
  const hasLegend = legendItems.length > 1;

  const openQuestion = useCallback(() => {
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

          onHoverChange?.(
            getSeriesHoverData(chartModel, settings, event, card.display),
          );
        },
      },
      {
        eventName: "click",
        handler: (event: EChartsSeriesMouseEvent) => {
          const clickData = getSeriesClickData(
            chartModel,
            settings,
            event,
            card.display,
          );

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
            openQuestion();
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
      openQuestion,
      rawSeries,
      selectedTimelineEventIds,
      settings,
      card.display,
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
      ).findIndex(
        series => getSeriesIdFromECharts(series.id, card.display) === seriesId,
      );

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
    [chartModel.seriesModels, hovered, option?.series, card.display],
  );

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

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

  const handleSelectSeries = useCallback(
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
        openQuestion();
      }
    },
    [
      chartModel.seriesModels,
      onVisualizationClick,
      openQuestion,
      settings,
      visualizationIsClickable,
    ],
  );

  const canSelectTitle = !!onChangeCardAndRun;

  return (
    <CartesianChartRoot isQueryBuilder={isQueryBuilder}>
      {hasTitle && (
        <LegendCaption
          title={title}
          description={description}
          icon={headerIcon}
          // @ts-expect-error will be fixed when LegendCaption gets converted to TypeScript
          actionButtons={actionButtons}
          onSelectTitle={canSelectTitle ? openQuestion : undefined}
          width={width}
        />
      )}
      <CartesianChartLegendLayout
        hasLegend={hasLegend}
        labels={legendItems.map(item => item.name)}
        colors={legendItems.map(item => item.color)}
        actionButtons={!hasTitle ? actionButtons : undefined}
        hovered={hovered}
        isFullscreen={isFullscreen}
        isQueryBuilder={isQueryBuilder}
        onSelectSeries={handleSelectSeries}
        onHoverChange={onHoverChange}
      >
        <CartesianChartRenderer
          option={option}
          eventHandlers={eventHandlers}
          onInit={handleInit}
        />
      </CartesianChartLegendLayout>
    </CartesianChartRoot>
  );
}
