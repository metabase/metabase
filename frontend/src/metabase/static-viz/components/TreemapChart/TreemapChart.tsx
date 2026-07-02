import { Group } from "@visx/group";
import { init } from "echarts/core";

import type { StaticChartProps } from "metabase/static-viz/components/StaticVisualization";
import { sanitizeSvgForBatik } from "metabase/static-viz/lib/svg";
import { extractRemappings } from "metabase/visualizations";
import { registerEChartsModules } from "metabase/visualizations/echarts";
import { getTreemapColors } from "metabase/visualizations/echarts/graph/treemap/model/colors";
import {
  getTreemapChartColumns,
  getTreemapData,
} from "metabase/visualizations/echarts/graph/treemap/model/data";
import { getTreemapFormatters } from "metabase/visualizations/echarts/graph/treemap/model/formatters";
import { shouldShowParentLabels } from "metabase/visualizations/echarts/graph/treemap/model/labels";
import { measureTreemapLabelLayouts } from "metabase/visualizations/echarts/graph/treemap/model/measure";
import { getTreemapLayoutNodes } from "metabase/visualizations/echarts/graph/treemap/model/tree";
import {
  type TreemapChartOptionConfig,
  getStaticTreemapOption,
} from "metabase/visualizations/echarts/graph/treemap/option/option";

import Watermark from "../../watermark.svg?component";

import { TreemapLegend } from "./TreemapLegend";
import { LEGEND_WIDTH, getTreemapLegendModel } from "./legend";

const CHART_WIDTH = 965;
const CHART_HEIGHT = 764;
const LEGEND_GAP = 48;

registerEChartsModules();

export function TreemapChart({
  rawSeries,
  settings,
  renderingContext,
  isStorybook = false,
  hasDevWatermark = false,
}: StaticChartProps) {
  const rawSeriesWithRemappings = extractRemappings(rawSeries);
  const cols = rawSeriesWithRemappings[0]?.data?.cols ?? [];
  const treemapColumns = getTreemapChartColumns(cols, settings);
  if (!treemapColumns) {
    return null;
  }

  const treemapRows = settings["treemap.rows"];
  const tree = getTreemapData(
    rawSeriesWithRemappings,
    treemapColumns,
    treemapRows,
    settings,
  );
  const colors = getTreemapColors(tree, treemapRows);
  const formatters = getTreemapFormatters(treemapColumns, settings);

  const config: TreemapChartOptionConfig = {
    tree,
    colors,
    showParentLabels: shouldShowParentLabels(undefined, settings),
    showLeafLabels: settings["treemap.show_leaf_labels"] ?? true,
    formatValue: formatters.value,
    formatPercent: formatters.percent,
    renderingContext,
  };

  const chart = init(null, null, {
    renderer: "svg",
    ssr: true,
    width: CHART_WIDTH,
    height: CHART_HEIGHT,
  });

  // first pass to general layout of nodes
  chart.setOption(getStaticTreemapOption(config));
  chart.renderToSVGString();
  const layouts = measureTreemapLabelLayouts({
    nodes: getTreemapLayoutNodes(chart),
    tree,
    formatters,
    renderingContext,
    showLeafLabels: settings["treemap.show_leaf_labels"] ?? true,
    showLeafValues: settings["treemap.show_leaf_values"] ?? true,
    showParentValues: settings["treemap.show_parent_values"] ?? true,
  });

  // 2nd to render/hide labels
  chart.setOption(getStaticTreemapOption(config, layouts));
  const chartSvg = sanitizeSvgForBatik(chart.renderToSVGString(), isStorybook);

  const legendModel = getTreemapLegendModel(
    tree,
    colors,
    formatters.value,
    formatters.percent,
  );
  const width = CHART_WIDTH + LEGEND_GAP + LEGEND_WIDTH;
  const height = Math.max(CHART_HEIGHT, legendModel.height);

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height}>
      <Group dangerouslySetInnerHTML={{ __html: chartSvg }}></Group>
      <TreemapLegend
        model={legendModel}
        left={CHART_WIDTH + LEGEND_GAP}
        renderingContext={renderingContext}
      />
      {hasDevWatermark && (
        <Watermark
          x="0"
          y="0"
          height={height}
          width={width}
          preserveAspectRatio="xMinYMin slice"
          fill={renderingContext.getColor("text-secondary")}
          opacity={0.2}
        />
      )}
    </svg>
  );
}
