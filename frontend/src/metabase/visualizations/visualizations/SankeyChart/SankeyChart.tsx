import { useCallback, useMemo, useRef } from "react";

import { ResponsiveEChartsRenderer } from "metabase/visualizations/components/EChartsRenderer";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";
import { useTooltipMouseLeave } from "metabase/visualizations/visualizations/CartesianChart/use-tooltip-mouse-leave";
import type { EChartsType } from "metabase/viz-core";
import {
  extractRemappings,
  getSankeyChartModel,
  getSankeyChartOption,
  getSankeyLayout,
  getTooltipOption,
  useCloseTooltipOnScroll,
  useSankeyChartColorsClasses,
} from "metabase/viz-core";

import { SANKEY_CHART_DEFINITION } from "./definition";
import { useChartEvents } from "./events";

const SankeyChartComponent = ({
  rawSeries,
  settings,
  fontFamily,
  clicked,
  width,
  height,
  onVisualizationClick,
  onHoverChange,
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
  useTooltipMouseLeave(chartRef, onHoverChange, containerRef);

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

export const SankeyChart = Object.assign(
  SankeyChartComponent,
  SANKEY_CHART_DEFINITION,
);
