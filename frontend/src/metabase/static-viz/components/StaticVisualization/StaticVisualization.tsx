import { registerStaticVisualizations } from "metabase/static-viz/register";
import {
  type StaticVisualizationProps,
  getComputedSettingsForSeries,
  getVisualizationTransformed,
} from "metabase/viz-core";

import { BoxPlotChart } from "../BoxPlotChart/BoxPlotChart";
import { ComboChart } from "../ComboChart";
import { FunnelBarChart } from "../FunnelBarChart";
import { PieChart } from "../PieChart/PieChart";
import { ProgressBar } from "../ProgressBar";
import { SankeyChart } from "../SankeyChart";
import { ScalarChart } from "../ScalarChart";
import { ScatterPlot } from "../ScatterPlot/ScatterPlot";
import { SmartScalar } from "../SmartScalar";
import { TreemapChart } from "../TreemapChart";
import { WaterfallChart } from "../WaterfallChart/WaterfallChart";

registerStaticVisualizations();

export const StaticVisualization = ({
  rawSeries,
  renderingContext,
  isStorybook,
  hasDevWatermark,
  width,
  height,
  fitWithinBounds,
}: StaticVisualizationProps): JSX.Element => {
  const display = rawSeries[0].card.display;
  const transformedSeries = getVisualizationTransformed(rawSeries).series;
  const settings = getComputedSettingsForSeries(transformedSeries);
  const props = {
    rawSeries,
    settings,
    renderingContext,
    isStorybook,
    hasDevWatermark,
    width,
    height,
    fitWithinBounds,
  };

  switch (display) {
    case "line":
    case "area":
    case "bar":
    case "combo":
    case "row":
      return <ComboChart {...props} />;
    case "scatter":
      return <ScatterPlot {...props} />;
    case "boxplot":
      return <BoxPlotChart {...props} />;
    case "waterfall":
      return <WaterfallChart {...props} />;
    case "funnel":
      return <FunnelBarChart {...props} />;
    case "scalar":
      return <ScalarChart {...props} />;
    case "smartscalar":
      return <SmartScalar {...props} />;
    case "pie":
      return <PieChart {...props} />;
    case "sankey":
      return <SankeyChart {...props} />;
    case "treemap":
      return <TreemapChart {...props} />;
    case "progress":
      return <ProgressBar {...props} />;
  }

  throw new Error(`Unsupported display type: ${display}`);
};
