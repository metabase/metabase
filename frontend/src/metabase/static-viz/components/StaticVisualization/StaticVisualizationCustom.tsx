import type { StaticVisualizationProps } from "metabase/visualizations/types";
import { isCustomVizDisplay } from "metabase-types/guards";

import { CustomStaticVisualization } from "./CustomStaticVisualization";

export const StaticVisualizationCustom = (props: StaticVisualizationProps) => {
  const display = props.rawSeries[0].card.display;

  if (!isCustomVizDisplay(display)) {
    throw new Error(
      `Unsupported display type in custom-viz static bundle: ${display}`,
    );
  }

  return <CustomStaticVisualization {...props} />;
};
