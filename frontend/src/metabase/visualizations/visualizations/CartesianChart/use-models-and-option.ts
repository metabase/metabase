import { useMemo } from "react";

import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";
import { measureTextWidth } from "metabase/lib/measure-text";
import type {
  RenderingContext,
  VisualizationProps,
} from "metabase/visualizations/types";
import { getCartesianChartModel } from "metabase/visualizations/echarts/cartesian/model";
import { getTimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/model";
import { getCartesianChartOption } from "metabase/visualizations/echarts/cartesian/option";
import { getWaterfallChartModel } from "metabase/visualizations/echarts/cartesian/waterfall/model";
import { getWaterfallChartOption } from "metabase/visualizations/echarts/cartesian/waterfall/option";
import type { CartesianChartModel } from "metabase/visualizations/echarts/cartesian/model/types";

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
}: VisualizationProps) {
  const seriesToRender = useMemo(
    () => (isPlaceholder ? transformedSeries : rawSeries),
    [isPlaceholder, transformedSeries, rawSeries],
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

  const chartModel = useMemo(() => {
    switch (card.display) {
      case "waterfall":
        return getWaterfallChartModel(
          seriesToRender,
          settings,
          renderingContext,
        );
      default:
        return getCartesianChartModel(
          seriesToRender,
          settings,
          renderingContext,
        );
    }
  }, [card.display, seriesToRender, settings, renderingContext]);

  const timelineEventsModel = useMemo(
    () =>
      getTimelineEventsModel(
        chartModel,
        timelineEvents ?? [],
        settings,
        width,
        height,
        renderingContext,
      ),
    [chartModel, timelineEvents, settings, width, height, renderingContext],
  );

  const option = useMemo(() => {
    if (width === 0 || height === 0) {
      return {};
    }

    switch (card.display) {
      case "waterfall":
        return getWaterfallChartOption(
          chartModel,
          timelineEventsModel,
          selectedTimelineEventIds ?? [],
          settings,
          width,
          height,
          renderingContext,
        );
      default:
        return getCartesianChartOption(
          chartModel as CartesianChartModel,
          timelineEventsModel,
          selectedTimelineEventIds ?? [],
          settings,
          width,
          height,
          renderingContext,
        );
    }
  }, [
    card.display,
    chartModel,
    height,
    width,
    selectedTimelineEventIds,
    settings,
    timelineEventsModel,
    renderingContext,
  ]);

  return { chartModel, timelineEventsModel, option };
}
