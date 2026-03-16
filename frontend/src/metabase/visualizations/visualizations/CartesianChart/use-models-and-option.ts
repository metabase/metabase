import { useCallback, useMemo } from "react";

import { useTranslateContent } from "metabase/i18n/hooks";
import { isReducedMotionPreferred } from "metabase/lib/dom";
import { extractRemappings } from "metabase/visualizations";
import { getChartLayout } from "metabase/visualizations/echarts/cartesian/layout";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import type {
  CartesianChartModel,
  ScatterPlotModel,
  WaterfallChartModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { getCartesianChartOption } from "metabase/visualizations/echarts/cartesian/option";
import { getTooltipOption } from "metabase/visualizations/echarts/cartesian/option/tooltip";
import { getScatterPlotModel } from "metabase/visualizations/echarts/cartesian/scatter/model";
import { getScatterPlotOption } from "metabase/visualizations/echarts/cartesian/scatter/option";
import { getTimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/model";
import { getWaterfallChartModel } from "metabase/visualizations/echarts/cartesian/waterfall/model";
import { getWaterfallChartOption } from "metabase/visualizations/echarts/cartesian/waterfall/option";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";
import type { CardDisplayType } from "metabase-types/api";

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
    selectedTimelineEventIds,
    onRender,
    hovered,
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
    () =>
      getTimelineEventsModel(
        chartModel,
        chartLayout,
        timelineEvents ?? [],
        renderingContext,
      ),
    [chartModel, chartLayout, timelineEvents, renderingContext],
  );

  const selectedOrHoveredTimelineEventIds = useMemo(() => {
    const ids = [];

    if (selectedTimelineEventIds != null) {
      ids.push(...selectedTimelineEventIds);
    }
    if (hovered?.timelineEvents != null) {
      ids.push(...hovered.timelineEvents.map((e) => e.id));
    }

    return ids;
  }, [selectedTimelineEventIds, hovered?.timelineEvents]);

  const tooltipOption = useMemo(() => {
    return getTooltipOption(
      chartModel,
      settings,
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
          chartModel as WaterfallChartModel,
          width,
          chartLayout,
          timelineEventsModel,
          selectedOrHoveredTimelineEventIds,
          settings,
          shouldAnimate,
          renderingContext,
        );
        break;
      case "scatter":
        baseOption = getScatterPlotOption(
          chartModel as ScatterPlotModel,
          chartLayout,
          timelineEventsModel,
          selectedOrHoveredTimelineEventIds,
          settings,
          width,
          shouldAnimate,
          renderingContext,
        );
        break;
      default:
        baseOption = getCartesianChartOption(
          chartModel as CartesianChartModel,
          chartLayout,
          timelineEventsModel,
          selectedOrHoveredTimelineEventIds,
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
    timelineEventsModel,
    selectedOrHoveredTimelineEventIds,
    settings,
    renderingContext,
  ]);

  return { chartModel, timelineEventsModel, option, renderingContext };
}
