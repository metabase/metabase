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
import { getWaterfallOption } from "metabase/visualizations/echarts/cartesian/waterfall/option";
import { checkWaterfallChartModel } from "metabase/visualizations/echarts/cartesian/waterfall/utils";

export function useModelsAndOption({
  rawSeries,
  series: transformedSeries,
  isPlaceholder,
  settings,
  card,
  fontFamily,
  width,
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
        renderingContext,
      ),
    [chartModel, timelineEvents, settings, width, renderingContext],
  );

  const option = useMemo(() => {
    switch (card.display) {
      case "waterfall":
        return getWaterfallOption(
          checkWaterfallChartModel(chartModel),
          timelineEventsModel,
          selectedTimelineEventIds ?? [],
          settings,
          width,
          renderingContext,
        );
      default:
        return getCartesianChartOption(
          chartModel,
          timelineEventsModel,
          selectedTimelineEventIds ?? [],
          settings,
          width,
          renderingContext,
        );
    }
  }, [
    card.display,
    chartModel,
    renderingContext,
    selectedTimelineEventIds,
    settings,
    timelineEventsModel,
    width,
  ]);

  return { chartModel, timelineEventsModel, option };
}
