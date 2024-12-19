import type { EChartsType } from "echarts/core";
import { useCallback, useMemo, useRef } from "react";
import _ from "underscore";

import { extractRemappings } from "metabase/visualizations";
import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { getSankeyLayout } from "metabase/visualizations/echarts/graph/sankey/layout";
import { getSankeyChartModel } from "metabase/visualizations/echarts/graph/sankey/model";
import { getSankeyChartOption } from "metabase/visualizations/echarts/graph/sankey/option";
import { getTooltipOption } from "metabase/visualizations/echarts/graph/sankey/option/tooltip";
import {
  useCloseTooltipOnScroll,
  useSankeyChartColorsClasses,
} from "metabase/visualizations/echarts/tooltip";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";

import { SANKEY_CHART_DEFINITION } from "./chart-definition";
import { useChartEvents } from "./events";

export const SankeyChart = ({
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
    () => getSankeyChartModel(rawSeriesWithRemappings, settings),
    [rawSeriesWithRemappings, settings],
  );
  const layout = useMemo(
    () =>
      getSankeyLayout(chartModel, settings, width, height, renderingContext),
    [chartModel, settings, width, height, renderingContext],
  );
  const option = useMemo(
    () => ({
      ...getSankeyChartOption(chartModel, layout, settings, renderingContext),
      tooltip: getTooltipOption(containerRef, chartModel),
    }),
    [chartModel, layout, settings, renderingContext],
  );

  const handleInit = useCallback((chart: EChartsType) => {
    chartRef.current = chart;
  }, []);

  const { eventHandlers } = useChartEvents(
    chartRef,
    chartModel.sankeyColumns,
    rawSeriesWithRemappings,
    settings,
    onVisualizationClick,
    clicked,
  );

  useCloseTooltipOnScroll(chartRef);

  const sankeyColorsCss = useSankeyChartColorsClasses(chartModel);

  return (
    <>
      <ResponsiveEChartsRenderer
        ref={containerRef}
        option={option}
        eventHandlers={eventHandlers}
        onInit={handleInit}
      />
      {sankeyColorsCss}
    </>
  );
};

Object.assign(SankeyChart, SANKEY_CHART_DEFINITION);
