import type { EChartsType } from "echarts/core";

import {
  DATA_VISIBILITY_ACTION,
  DATA_VISIBILITY_EVENT,
  isDataVisibilityResult,
} from "metabase/viz-core";

/**
 * Asks a rendered chart whether it actually painted anything inside the plot
 * area. Call it after `renderToSVGString` and before `dispose`: the reply
 * arrives synchronously, since `dispatchAction` runs the handler and triggers
 * the event before returning.
 */
export const readAllPointsOutOfRange = (chart: EChartsType) => {
  let allPointsOutOfRange = false;

  const handleResult = (event: unknown) => {
    if (isDataVisibilityResult(event)) {
      allPointsOutOfRange = !event.anythingRendered;
    }
  };

  chart.on(DATA_VISIBILITY_EVENT, handleResult);
  chart.dispatchAction({ type: DATA_VISIBILITY_ACTION });
  chart.off(DATA_VISIBILITY_EVENT, handleResult);

  return allPointsOutOfRange;
};
