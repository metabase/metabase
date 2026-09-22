import { useCallback, useMemo } from "react";

import { useTranslateContent } from "metabase/content-translation/hooks";
import { isReducedMotionPreferred } from "metabase/utils/dom";
import { getTooltipOption } from "metabase/visualizations/echarts/cartesian/option/tooltip";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";
import {
  type CartesianChartModel,
  type ScatterPlotModel,
  type WaterfallChartModel,
  extractRemappings,
  getCartesianChartModel,
  getCartesianChartOption,
  getChartLayout,
  getScatterPlotModel,
  getScatterPlotOption,
  getTimelineEventsModel,
  getWaterfallChartModel,
  getWaterfallChartOption,
} from "metabase/viz-core";
import type { CardDisplayType, TimelineEventId } from "metabase-types/api";

const NO_SELECTED_TIMELINE_EVENT_IDS: TimelineEventId[] = [];

export function useModelsAndOption(
  {
    rawSeries,
    settings,
    card,
    fontFamily,
    width,
    height,
    hiddenSeries = new Set(),
    timelineEvents,
    selectedTimelineEventIds = NO_SELECTED_TIMELINE_EVENT_IDS,
    onRender,
    isFullscreen,
    gridSize,
  }: VisualizationProps,
  containerRef: React.RefObject<HTMLDivElement>,
) {
  const tc = useTranslateContent();

  const renderingContext = useBrowserRenderingContext({
    fontFamily,
    isFullscreen,
  });

  const seriesToRender = useMemo(
    () => extractRemappings(rawSeries),
    [rawSeries],
  );

  const showWarning = useCallback(
    (warning: string) => onRender({ warnings: [warning] }),
    [onRender],
  );

  const hasTimelineEvents = timelineEvents
    ? timelineEvents.length !== 0
    : false;

  const chartModel = useMemo(() => {
    let getModel;

    settings["graph.x_axis.title_text"] = tc(
      settings["graph.x_axis.title_text"],
    );
    settings["graph.y_axis.title_text"] = tc(
      settings["graph.y_axis.title_text"],
    );

    getModel = getCartesianChartModel;
    if (card.display === "waterfall") {
      getModel = getWaterfallChartModel;
    } else if (card.display === "scatter") {
      getModel = getScatterPlotModel;
    }

    const model = getModel(
      seriesToRender,
      settings,
      Array.from(hiddenSeries),
      renderingContext,
      showWarning,
      gridSize,
    );

    if (model.dimensionModel.column) {
      model.dimensionModel.column.display_name = tc(
        model.dimensionModel.column.display_name,
      );
    }
    return model;
  }, [
    card.display,
    seriesToRender,
    settings,
    hiddenSeries,
    renderingContext,
    showWarning,
    gridSize,
    tc,
  ]);

  const chartLayout = useMemo(
    () =>
      getChartLayout(
        chartModel,
        settings,
        hasTimelineEvents,
        width,
        height,
        renderingContext,
      ),
    [chartModel, settings, width, height, hasTimelineEvents, renderingContext],
  );

  const timelineEventsModel = useMemo(
    () => getTimelineEventsModel(chartModel, chartLayout, timelineEvents ?? []),
    [chartModel, chartLayout, timelineEvents],
  );

  const tooltipOption = useMemo(() => {
    return getTooltipOption(
      chartModel,
      settings,
      // Unjustified type cast. FIXME
      card.display as CardDisplayType,
      containerRef,
    );
  }, [chartModel, settings, card.display, containerRef]);

  const option = useMemo(() => {
    if (width === 0 || height === 0) {
      return {};
    }

    const shouldAnimate = !isReducedMotionPreferred();

    let baseOption;

    switch (card.display) {
      case "waterfall":
        baseOption = getWaterfallChartOption(
          // Unjustified type cast. FIXME
          chartModel as WaterfallChartModel,
          width,
          chartLayout,
          hasTimelineEvents,
          timelineEventsModel,
          selectedTimelineEventIds,
          settings,
          shouldAnimate,
          renderingContext,
        );
        break;
      case "scatter":
        baseOption = getScatterPlotOption(
          // Unjustified type cast. FIXME
          chartModel as ScatterPlotModel,
          chartLayout,
          hasTimelineEvents,
          timelineEventsModel,
          selectedTimelineEventIds,
          settings,
          width,
          shouldAnimate,
          renderingContext,
        );
        break;
      default:
        baseOption = getCartesianChartOption(
          // Unjustified type cast. FIXME
          chartModel as CartesianChartModel,
          chartLayout,
          hasTimelineEvents,
          timelineEventsModel,
          selectedTimelineEventIds,
          settings,
          width,
          shouldAnimate,
          renderingContext,
        );
    }

    return {
      ...baseOption,
      tooltip: tooltipOption,
    };
  }, [
    width,
    height,
    card.display,
    tooltipOption,
    chartModel,
    chartLayout,
    hasTimelineEvents,
    timelineEventsModel,
    selectedTimelineEventIds,
    settings,
    renderingContext,
  ]);

  return {
    chartModel,
    chartLayout,
    timelineEventsModel,
    option,
    renderingContext,
  };
}
