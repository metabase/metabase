import { useRef } from "react";
import _ from "underscore";

import { getSankeyLayout } from "metabase/visualizations/echarts/graph/sankey/layout";
import { getSankeyChartModel } from "metabase/visualizations/echarts/graph/sankey/model";
import { getSankeyChartOption } from "metabase/visualizations/echarts/graph/sankey/option";
import { getTooltipOption } from "metabase/visualizations/echarts/graph/sankey/option/tooltip";
import { useBrowserRenderingContext } from "metabase/visualizations/hooks/use-browser-rendering-context";
import type { VisualizationProps } from "metabase/visualizations/types";

import { SankeyChartRenderer } from "./SankeyChart.styled";
import { SANKEY_CHART_DEFINITION } from "./chart-definition";

export const SankeyChart = ({
  rawSeries,
  settings,
  fontFamily,
}: VisualizationProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderingContext = useBrowserRenderingContext({ fontFamily });
  const model = getSankeyChartModel(rawSeries, settings);
  const layout = getSankeyLayout(model, settings, renderingContext);
  const option = {
    ...getSankeyChartOption(model, layout, settings, renderingContext),
    tooltip: getTooltipOption(containerRef, model.sankeyColumns.value.column),
  };

  return <SankeyChartRenderer ref={containerRef} option={option} />;
};

Object.assign(SankeyChart, SANKEY_CHART_DEFINITION);
