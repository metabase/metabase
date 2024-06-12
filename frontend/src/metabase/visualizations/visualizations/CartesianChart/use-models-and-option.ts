import { useCallback, useMemo } from "react";

import { isReducedMotionPreferred } from "metabase/lib/dom";
import { extractRemappings } from "metabase/visualizations";
import { getChartMeasurements } from "metabase/visualizations/echarts/cartesian/chart-measurements";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import type {
  CartesianChartModel,
  ScatterPlotModel,
  WaterfallChartModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { getCartesianChartOption } from "metabase/visualizations/echarts/cartesian/option";
import { getScatterPlotModel } from "metabase/visualizations/echarts/cartesian/scatter/model";
import { getScatterPlotOption } from "metabase/visualizations/echarts/cartesian/scatter/option";
import { getTimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/model";
import { getWaterfallChartModel } from "metabase/visualizations/echarts/cartesian/waterfall/model";
import { getWaterfallChartOption } from "metabase/visualizations/echarts/cartesian/waterfall/option";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";

import { getHoveredSeriesDataKey } from "./utils";

export function useModelsAndOption({
  rawSeries,
  series: transformedSeries,
  isPlaceholder,
  settings,
  card,
  fontFamily,
  width,
  height,
  timelineEvents,
  selectedTimelineEventIds,
  onRender,
  hovered,
}: VisualizationProps) {
  const rawSeriesWithRemappings = useMemo(
    () => extractRemappings(rawSeries),
    [rawSeries],
  );

  const seriesToRender = useMemo(
    () => (isPlaceholder ? transformedSeries : rawSeriesWithRemappings),
    [isPlaceholder, transformedSeries, rawSeriesWithRemappings],
  );

  const showWarning = useCallback(
    (warning: string) => onRender({ warnings: [warning] }),
    [onRender],
  );

  const renderingContext = useBrowserRenderingContext(fontFamily);

  const hasTimelineEvents = timelineEvents
    ? timelineEvents.length !== 0
    : false;

  const chartModel = useMemo(() => {
    let getModel;

    getModel = getCartesianChartModel;
    if (card.display === "waterfall") {
      getModel = getWaterfallChartModel;
    } else if (card.display === "scatter") {
      getModel = getScatterPlotModel;
    }

    return getModel(seriesToRender, settings, renderingContext, showWarning);
  }, [card.display, seriesToRender, settings, renderingContext, showWarning]);

  const chartMeasurements = useMemo(
    () =>
      getChartMeasurements(
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
        chartMeasurements,
        timelineEvents ?? [],
        renderingContext,
      ),
    [chartModel, chartMeasurements, timelineEvents, renderingContext],
  );

  const hoveredSeriesDataKey = useMemo(
    () => getHoveredSeriesDataKey(chartModel.seriesModels, hovered),
    [chartModel.seriesModels, hovered],
  );

  const selectedOrHoveredTimelineEventIds = useMemo(() => {
    const ids = [];

    if (selectedTimelineEventIds != null) {
      ids.push(...selectedTimelineEventIds);
    }
    if (hovered?.timelineEvents != null) {
      ids.push(...hovered.timelineEvents.map(e => e.id));
    }

    return ids;
  }, [selectedTimelineEventIds, hovered?.timelineEvents]);

  const option = useMemo(() => {
    if (width === 0 || height === 0) {
      return {};
    }

    const shouldAnimate = !isPlaceholder && !isReducedMotionPreferred();

    switch (card.display) {
      case "waterfall":
        return getWaterfallChartOption(
          chartModel as WaterfallChartModel,
          width,
          chartMeasurements,
          timelineEventsModel,
          selectedOrHoveredTimelineEventIds,
          settings,
          shouldAnimate,
          renderingContext,
        );
      case "scatter":
        return getScatterPlotOption(
          chartModel as ScatterPlotModel,
          chartMeasurements,
          timelineEventsModel,
          selectedOrHoveredTimelineEventIds,
          settings,
          width,
          shouldAnimate,
          renderingContext,
        );
      default:
        return getCartesianChartOption(
          chartModel as CartesianChartModel,
          chartMeasurements,
          timelineEventsModel,
          selectedOrHoveredTimelineEventIds,
          settings,
          width,
          shouldAnimate,
          hoveredSeriesDataKey,
          renderingContext,
        );
    }
  }, [
    card.display,
    chartModel,
    chartMeasurements,
    renderingContext,
    settings,
    timelineEventsModel,
    hoveredSeriesDataKey,
    width,
    height,
    isPlaceholder,
    selectedOrHoveredTimelineEventIds,
  ]);

  return { chartModel, timelineEventsModel, option };
}
