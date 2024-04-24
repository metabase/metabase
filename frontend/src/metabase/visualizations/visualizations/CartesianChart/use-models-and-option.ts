import { useCallback, useMemo } from "react";

import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";
import { measureTextWidth } from "metabase/lib/measure-text";
import { getChartMeasurements } from "metabase/visualizations/echarts/cartesian/chart-measurements";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import type { CartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";
import { getCartesianChartOption } from "metabase/visualizations/echarts/cartesian/option";
import { getTimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/model";
import { getWaterfallChartModel } from "metabase/visualizations/echarts/cartesian/waterfall/model";
import { getWaterfallChartOption } from "metabase/visualizations/echarts/cartesian/waterfall/option";
import type {
  RenderingContext,
  VisualizationProps,
} from "metabase/visualizations/types";

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
  const seriesToRender = useMemo(
    () => (isPlaceholder ? transformedSeries : rawSeries),
    [isPlaceholder, transformedSeries, rawSeries],
  );

  const showWarning = useCallback(
    (warning: string) => onRender({ warnings: [warning] }),
    [onRender],
  );

  const renderingContext: RenderingContext = useMemo(
    () => ({
      getColor: color,
      formatValue: (value, options) => String(formatValue(value, options)),
      measureText: measureTextWidth,
      fontFamily,
    }),
    [fontFamily],
  );

  const hasTimelineEvents = timelineEvents
    ? timelineEvents.length !== 0
    : false;

  const chartModel = useMemo(() => {
    switch (card.display) {
      case "waterfall":
        return getWaterfallChartModel(
          seriesToRender,
          settings,
          renderingContext,
          showWarning,
        );
      default:
        return getCartesianChartModel(
          seriesToRender,
          settings,
          renderingContext,
          showWarning,
        );
    }
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

  const option = useMemo(() => {
    if (width === 0 || height === 0) {
      return {};
    }

    switch (card.display) {
      case "waterfall":
        return getWaterfallChartOption(
          chartModel,
          width,
          chartMeasurements,
          timelineEventsModel,
          selectedTimelineEventIds ?? [],
          settings,
          isPlaceholder ?? false,
          renderingContext,
        );
      default:
        return getCartesianChartOption(
          chartModel as CartesianChartModel,
          chartMeasurements,
          timelineEventsModel,
          selectedTimelineEventIds ?? [],
          settings,
          width,
          isPlaceholder ?? false,
          hoveredSeriesDataKey,
          renderingContext,
        );
    }
  }, [
    card.display,
    chartModel,
    chartMeasurements,
    renderingContext,
    selectedTimelineEventIds,
    settings,
    timelineEventsModel,
    hoveredSeriesDataKey,
    width,
    height,
    isPlaceholder,
  ]);

  return { chartModel, timelineEventsModel, option };
}
