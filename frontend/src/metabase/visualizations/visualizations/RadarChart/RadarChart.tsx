import type { EChartsType } from "echarts/core";
import { useCallback, useMemo, useRef } from "react";

import { extractRemappings } from "metabase/visualizations";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { getRadarChartModel } from "metabase/visualizations/echarts/graph/radar/model";
import { getRadarChartOption } from "metabase/visualizations/echarts/graph/radar/option";
import { getTooltipOption } from "metabase/visualizations/echarts/graph/radar/option/tooltip";
import { useCloseTooltipOnScroll } from "metabase/visualizations/echarts/tooltip";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";

import { RADAR_CHART_DEFINITION } from "./chart-definition";
import { useChartEvents } from "./events";

export const RadarChart = ({
  rawSeries,
  settings,
  fontFamily,
  clicked,
  width,
  height,
  onVisualizationClick,
}: VisualizationProps) => {
  const rawSeriesWithRemappings = useMemo(
    () => extractRemappings(rawSeries),
    [rawSeries],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType>();
  const renderingContext = useBrowserRenderingContext({ fontFamily });

  const chartModel = useMemo(
    () => getRadarChartModel(rawSeriesWithRemappings, settings),
    [rawSeriesWithRemappings, settings],
  );

  const option = useMemo(
    () => ({
      ...getRadarChartOption(
        chartModel,
        settings,
        width,
        height,
        renderingContext,
      ),
      tooltip: getTooltipOption(containerRef, chartModel),
    }),
    [chartModel, settings, width, height, renderingContext],
  );

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const { eventHandlers } = useChartEvents(
    chartRef,
    chartModel,
    rawSeriesWithRemappings,
    settings,
    onVisualizationClick,
    clicked ?? undefined,
  );

  useCloseTooltipOnScroll(chartRef);

  return (
    <ResponsiveEChartsRenderer
      ref={containerRef}
      option={option}
      eventHandlers={eventHandlers}
      onInit={handleInit}
    />
  );
};

Object.assign(RadarChart, RADAR_CHART_DEFINITION);
