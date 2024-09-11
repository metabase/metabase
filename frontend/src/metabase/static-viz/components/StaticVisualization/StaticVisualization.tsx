import type { StaticVisualizationProps } from "metabase/visualizations/types";

import { ComboChart } from "../ComboChart";
import { FunnelBarChart } from "../FunnelBarChart";
import { ScalarChart } from "../ScalarChart";
import { ScatterPlot } from "../ScatterPlot/ScatterPlot";
import { SmartScalar } from "../SmartScalar";
import { WaterfallChart } from "../WaterfallChart/WaterfallChart";

export const StaticVisualization = (props: StaticVisualizationProps) => {
  const display = props.rawSeries[0].card.display;

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
  }

  throw new Error(`Unsupported display type: ${display}`);
};
