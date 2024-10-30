import type { EChartsType } from "echarts/core";
import { useCallback, useMemo, useRef } from "react";
import _ from "underscore";

import { extractRemappings } from "metabase/visualizations";
import { getSankeyLayout } from "metabase/visualizations/echarts/graph/sankey/layout";
import { getSankeyChartModel } from "metabase/visualizations/echarts/graph/sankey/model";
import { getSankeyChartOption } from "metabase/visualizations/echarts/graph/sankey/option";
import { getTooltipOption } from "metabase/visualizations/echarts/graph/sankey/option/tooltip";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";

import { SankeyChartRenderer } from "./SankeyChart.styled";
import { SANKEY_CHART_DEFINITION } from "./chart-definition";
import { useChartEvents } from "./events";

export const SankeyChart = ({
  rawSeries,
  settings,
  fontFamily,
  clicked,
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
    () => getSankeyLayout(chartModel, settings, renderingContext),
    [chartModel, settings, renderingContext],
  );
  const option = useMemo(
    () => ({
      ...getSankeyChartOption(chartModel, layout, settings, renderingContext),
      tooltip: getTooltipOption(
        containerRef,
        chartModel.sankeyColumns.value.column,
      ),
    }),
    [chartModel, layout, settings, renderingContext],
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
    clicked,
  );

  return (
    <SankeyChartRenderer
      ref={containerRef}
      option={option}
      eventHandlers={eventHandlers}
      onInit={handleInit}
    />
  );
};

Object.assign(SankeyChart, SANKEY_CHART_DEFINITION);
