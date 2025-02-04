import { useCallback, useMemo } from "react";

import { skipToken, useGetCardQueryQuery } from "metabase/api";
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
    series: transformedSeries,
    isPlaceholder,
    settings: rawSettings,
    card,
    fontFamily,
    width,
    height,
    hiddenSeries = new Set(),
    timelineEvents,
    selectedTimelineEventIds,
    onRender,
    hovered,
  }: VisualizationProps,
  containerRef: React.RefObject<HTMLDivElement>,
) {
  const renderingContext = useBrowserRenderingContext({ fontFamily });

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

  const hasTimelineEvents = timelineEvents
    ? timelineEvents.length !== 0
    : false;

  const hasCardGoalLine =
    typeof rawSettings["graph.goal_value"] === "object" &&
    rawSettings["graph.goal_value"].type === "card";

  const { data: goalQueryResults } = useGetCardQueryQuery(
    // TODO don't run query if "graph.show_goal" is false
    // TODO ensure it reruns when QB 🔄 button is clicked
    hasCardGoalLine
      ? {
          cardId: rawSettings["graph.goal_value"]?.card_id,
        }
      : skipToken,
  );

  const goalLineValue = useMemo(() => {
    if (!rawSettings["graph.goal_value"]) {
      return;
    }

    if (hasCardGoalLine) {
      if (!goalQueryResults) {
        return;
      }

      const columnIndex = goalQueryResults.data.cols.findIndex(
        col => col.name === rawSettings["graph.goal_value"].value_field,
      );

      if (columnIndex === -1) {
        return;
      }

      return goalQueryResults.data.rows[0][columnIndex];
    }

    return rawSettings["graph.goal_value"];
  }, [goalQueryResults, hasCardGoalLine, rawSettings]);

  const settings = useMemo(() => {
    if (hasCardGoalLine) {
      return {
        ...rawSettings,
        "graph.goal_value": goalLineValue,
      };
    }
    return rawSettings;
  }, [hasCardGoalLine, rawSettings, goalLineValue]);

  const chartModel = useMemo(() => {
    let getModel;

    getModel = getCartesianChartModel;
    if (card.display === "waterfall") {
      getModel = getWaterfallChartModel;
    } else if (card.display === "scatter") {
      getModel = getScatterPlotModel;
    }

    return getModel(
      seriesToRender,
      settings,
      Array.from(hiddenSeries),
      renderingContext,
      showWarning,
    );
  }, [
    card.display,
    seriesToRender,
    settings,
    hiddenSeries,
    renderingContext,
    showWarning,
  ]);

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

    const shouldAnimate = !isPlaceholder && !isReducedMotionPreferred();

    let baseOption;
    switch (card.display) {
      case "waterfall":
        baseOption = getWaterfallChartOption(
          chartModel as WaterfallChartModel,
          width,
          chartMeasurements,
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
          chartMeasurements,
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
          chartMeasurements,
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
    isPlaceholder,
    card.display,
    tooltipOption,
    chartModel,
    chartMeasurements,
    timelineEventsModel,
    selectedOrHoveredTimelineEventIds,
    settings,
    renderingContext,
  ]);

  return { chartModel, timelineEventsModel, option };
}
