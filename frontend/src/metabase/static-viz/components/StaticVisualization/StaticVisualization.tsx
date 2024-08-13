import { extractRemappings } from "metabase/visualizations";
import type { StaticVisualizationProps } from "metabase/visualizations/types";

import { ComboChart } from "../ComboChart";
import { FunnelBarChart } from "../FunnelBarChart";
import { PieChart } from "../PieChart/PieChart";
import { ScalarChart } from "../ScalarChart";
import { ScatterPlot } from "../ScatterPlot/ScatterPlot";
import { SmartScalar } from "../SmartScalar";
import { WaterfallChart } from "../WaterfallChart/WaterfallChart";

export const StaticVisualization = (props: StaticVisualizationProps) => {
  const display = props.rawSeries[0].card.display;
  const staticVisualizationProps = {
    ...props,
    rawSeries: extractRemappings(props.rawSeries),
  };

  switch (display) {
    case "line":
    case "area":
    case "bar":
    case "combo":
      return <ComboChart {...staticVisualizationProps} />;
    case "scatter":
      return <ScatterPlot {...staticVisualizationProps} />;
    case "waterfall":
      return <WaterfallChart {...staticVisualizationProps} />;
    case "funnel":
      return <FunnelBarChart {...staticVisualizationProps} />;
    case "scalar":
      return <ScalarChart {...staticVisualizationProps} />;
    case "smartscalar":
      return <SmartScalar {...staticVisualizationProps} />;
    case "pie":
      return <PieChart {...staticVisualizationProps} />;
  }

  throw new Error(`Unsupported display type: ${display}`);
};
