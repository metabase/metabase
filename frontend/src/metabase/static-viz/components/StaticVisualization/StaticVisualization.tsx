import { registerStaticVisualizations } from "metabase/static-viz/register";
import { getVisualizationTransformed } from "metabase/visualizations";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type { StaticVisualizationProps } from "metabase/visualizations/types";

import { ComboChart } from "../ComboChart";
import { FunnelBarChart } from "../FunnelBarChart";
import { PieChart } from "../PieChart/PieChart";
import { ScalarChart } from "../ScalarChart";
import { ScatterPlot } from "../ScatterPlot/ScatterPlot";
import { SmartScalar } from "../SmartScalar";
import { WaterfallChart } from "../WaterfallChart/WaterfallChart";

registerStaticVisualizations();

export const StaticVisualization = ({
  rawSeries,
  renderingContext,
  isStorybook,
}: StaticVisualizationProps) => {
  const display = rawSeries[0].card.display;
  const transformedSeries = getVisualizationTransformed(rawSeries).series;
  const settings = getComputedSettingsForSeries(transformedSeries);
  const props = {
    rawSeries,
    settings,
    renderingContext,
    isStorybook,
  };

  switch (display) {
    case "line":
    case "area":
    case "bar":
    case "combo":
      return <ComboChart {...props} />;
    case "scatter":
      return <ScatterPlot {...props} />;
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
  }

  throw new Error(`Unsupported display type: ${display}`);
};
