import { isCartesianChart } from "metabase/visualizations";
import type { VisualizationDisplay } from "metabase-types/api";

import { cartesianDropHandler } from "./cartesian";
import { funnelDropHandler } from "./funnel";
import type { VizDropHandlerOpts } from "./types";

type VizDropHandler = (opts: VizDropHandlerOpts) => void;

const handlers: Partial<Record<VisualizationDisplay, VizDropHandler>> = {
  funnel: funnelDropHandler,
};

export function handleVisualizerDragEnd(
  display: VisualizationDisplay,
  opts: VizDropHandlerOpts,
) {
  if (isCartesianChart(display)) {
    cartesianDropHandler(opts);
  } else {
    handlers[display]?.(opts);
  }
}
