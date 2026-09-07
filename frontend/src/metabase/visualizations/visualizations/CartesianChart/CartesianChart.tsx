import type { EChartsType } from "echarts/core";
import React, {
  type MouseEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSet } from "react-use";

import { isWebkit } from "metabase/utils/browser";
import { ChartRenderingErrorBoundary } from "metabase/visualizations/components/ChartRenderingErrorBoundary";
import { DataPointsVisiblePopover } from "metabase/visualizations/components/DataPointsVisiblePopover/DataPointsVisiblePopover";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { LegendCaption } from "metabase/visualizations/components/legend/LegendCaption";
import { useTimelineEvents } from "metabase/visualizations/hooks/use-timeline-events";
import type { VisualizationProps } from "metabase/visualizations/types";
import {
  CartesianChartLegendLayout,
  CartesianChartRoot,
} from "metabase/visualizations/visualizations/CartesianChart/CartesianChart.styled";
import type { CartesianHoveredObject } from "metabase/visualizations/visualizations/CartesianChart/types";
import { useChartEvents } from "metabase/visualizations/visualizations/CartesianChart/use-chart-events";
import {
  type TimelineEventGroup,
  getLegendItems,
  useCartesianChartSeriesColorsClasses,
  useCloseTooltipOnScroll,
} from "metabase/viz-core";

import { TimelineEventsBand } from "./TimelineEventsBand";
import { useChartDebug } from "./use-chart-debug";
import { useModelsAndOption } from "./use-models-and-option";
import { useTimelineEventsHover } from "./use-timeline-events-hover";
import {
  getDashboardAdjustedSettings,
  getHoveredFromHighlighted,
} from "./utils";

function CartesianChartInner(props: VisualizationProps) {
  const { timelineEvents } = useTimelineEvents(props);

  const containerRef = useRef<HTMLDivElement>(null);
  // The width and height from props reflect the dimensions of the entire container which includes legend,
  // however, for correct ECharts option calculation we need to use the dimensions of the chart viewport
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });

  const [hiddenSeries, { toggle: toggleSeriesVisibility }] = useSet<string>();

  const {
    showAllLegendItems,
    hideLegend,
    rawSeries,
    settings: originalSettings,
    autoAdjustSettings = false,
    card,
    getHref,
    width: outerWidth,
    height: outerHeight,
    showTitle,
    headerIcon,
    actionButtons,
    isDashboard,
    isEditing,
    isVisualizer,
    isQueryBuilder,
    isVisualizerCard,
    isFullscreen,
    onChangeCardAndRun,
    onHoverChange,
    canToggleSeriesVisibility,
    titleMenuItems,
    onOpenTimelines,
    onSelectTimelineEvents,
    onDeselectTimelineEvents,
    onSeeAllEvents,
    selectedTimelineEventIds,
  } = props;

  const settings = useMemo(
    () =>
      autoAdjustSettings
        ? getDashboardAdjustedSettings?.({
            settings: originalSettings,
            height: outerHeight,
            width: outerWidth,
          })
        : originalSettings,
    [originalSettings, outerHeight, outerWidth, autoAdjustSettings],
  );

  const [hoveredTimelineEventGroup, setHoveredTimelineEventGroup] =
    useState<TimelineEventGroup | null>(null);

  const {
    chartModel,
    chartLayout,
    timelineEventsModel,
    option,
    renderingContext,
  } = useModelsAndOption(
    {
      ...props,
      width: chartSize.width,
      height: chartSize.height,
      hiddenSeries,
      settings,
      timelineEvents,
    },
    containerRef,
  );
  useChartDebug({ isQueryBuilder, rawSeries, option, chartModel });

  const chartRef = useRef<EChartsType>();
  // Mirror the ECharts instance into state so that effects depending on it
  // (e.g. brush setup) re-run once it becomes available. The renderer renders
  // nothing until ExplicitSize has measured it, which it does a tick after
  // mount, so `onInit` fires after the surrounding effects have already run and
  // a ref assignment alone would not re-trigger them.
  const [chartInstance, setChartInstance] = useState<EChartsType>();

  const description = settings["card.description"];

  const legendItems = useMemo(
    () => getLegendItems(chartModel.seriesModels, showAllLegendItems),
    [chartModel, showAllLegendItems],
  );
  const hasLegend = !hideLegend && legendItems.length > 0;

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
    setChartInstance(chart);

    // HACK: clip paths cause glitches in Safari on multiseries line charts on dashboards (metabase#51383)
    if (isWebkit()) {
      chartRef.current.on("finished", () => {
        const svg = containerRef.current?.querySelector("svg");
        if (svg) {
          const clipPaths = svg.querySelectorAll('defs > clipPath[id^="zr"]');
          clipPaths.forEach((cp) => cp.setAttribute("id", ""));
        }
      });
    }
  }, []);

  const handleToggleSeriesVisibility = useCallback(
    (event: MouseEvent, seriesIndex: number) => {
      const seriesModel = chartModel.seriesModels[seriesIndex];
      const willShowSeries = hiddenSeries.has(seriesModel.dataKey);
      const hasMoreVisibleSeries =
        chartModel.seriesModels.length - hiddenSeries.size > 1;
      if (hasMoreVisibleSeries || willShowSeries) {
        toggleSeriesVisibility(seriesModel.dataKey);
      }
    },
    [chartModel, hiddenSeries, toggleSeriesVisibility],
  );

  const hovered: CartesianHoveredObject | null = useMemo(() => {
    if (props.hovered) {
      return props.hovered;
    }
    if (props.highlighted) {
      return getHoveredFromHighlighted(
        props.highlighted,
        rawSeries,
        chartModel,
      );
    }
    return null;
  }, [props.hovered, props.highlighted, rawSeries, chartModel]);

  const { onSelectSeries, onOpenQuestion, eventHandlers } = useChartEvents(
    chartRef,
    containerRef,
    chartModel,
    option,
    renderingContext,
    hovered,
    props,
    chartInstance,
  );

  const handleResize = useCallback((width: number, height: number) => {
    setChartSize({ width, height });
  }, []);

  const timelineEventsXAxisIndex =
    chartLayout.panelHeight != null
      ? chartModel.seriesModels.filter((series) => series.visible).length - 1
      : 0;

  useTimelineEventsHover({
    chartRef,
    hoveredTimelineEventGroup,
    chartModel,
    chartLayout,
    option,
    timelineEventsModel,
    renderingContext,
    display: card.display,
    selectedTimelineEventIds,
  });

  // We can't navigate a user to a particular card from a visualizer viz,
  // so title selection is disabled in this case
  const canSelectTitle =
    !!onChangeCardAndRun &&
    (!isVisualizerCard || React.Children.count(titleMenuItems) === 1);

  const seriesColorsCss = useCartesianChartSeriesColorsClasses(
    chartModel,
    settings,
  );

  useCloseTooltipOnScroll(chartRef);

  return (
    <CartesianChartRoot
      isQueryBuilder={isQueryBuilder}
      className="CardVisualization"
    >
      {showTitle && (
        <LegendCaption
          title={settings["card.title"] ?? card.name}
          description={description}
          icon={headerIcon}
          actionButtons={actionButtons}
          hasInfoTooltip={!isDashboard || !isEditing}
          getHref={canSelectTitle ? getHref : undefined}
          onSelectTitle={
            canSelectTitle ? () => onOpenQuestion(card.id) : undefined
          }
          width={outerWidth}
          titleMenuItems={titleMenuItems}
        />
      )}
      <CartesianChartLegendLayout
        isReversed={settings["legend.is_reversed"]}
        hasLegend={hasLegend}
        items={legendItems}
        actionButtons={!showTitle ? actionButtons : undefined}
        hovered={hovered}
        isFullscreen={isFullscreen}
        isQueryBuilder={isQueryBuilder}
        onSelectSeries={onSelectSeries}
        onToggleSeriesVisibility={
          canToggleSeriesVisibility ? handleToggleSeriesVisibility : undefined
        }
        onHoverChange={onHoverChange}
        width={outerWidth}
        height={outerHeight}
      >
        <ResponsiveEChartsRenderer
          ref={containerRef}
          option={option}
          eventHandlers={eventHandlers}
          onResize={handleResize}
          onInit={handleInit}
        >
          <DataPointsVisiblePopover
            isDashboard={isDashboard}
            isVisualizer={isVisualizer}
            chartModel={chartModel}
            settings={settings}
          />
          <TimelineEventsBand
            chartInstance={chartInstance}
            chartSize={chartSize}
            timelineEventsModel={timelineEventsModel}
            chartLayout={chartLayout}
            xAxisIndex={timelineEventsXAxisIndex}
            selectedTimelineEventIds={selectedTimelineEventIds}
            onGroupHover={setHoveredTimelineEventGroup}
            onOpenTimelines={onOpenTimelines}
            onSelectTimelineEvents={onSelectTimelineEvents}
            onDeselectTimelineEvents={onDeselectTimelineEvents}
            onSeeAllEvents={onSeeAllEvents}
          />
        </ResponsiveEChartsRenderer>
      </CartesianChartLegendLayout>
      {seriesColorsCss}
    </CartesianChartRoot>
  );
}

export function CartesianChart(props: VisualizationProps) {
  return (
    <ChartRenderingErrorBoundary onRenderError={props.onRenderError}>
      <CartesianChartInner {...props} />
    </ChartRenderingErrorBoundary>
  );
}
