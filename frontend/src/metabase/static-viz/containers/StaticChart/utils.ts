import type { RawSeries } from "metabase-types/api";
import { createColorGetter } from "metabase/static-viz/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import { measureTextWidth } from "metabase/lib/measure-text";

import type { IsomorphicChartProps, StaticChartType } from "./types";
import { ISOMORPHIC_CHART_TYPES } from "./constants";

export function getIsomorhpicProps({
  type,
  options,
}: {
  type: StaticChartType;
  options: any;
}): IsomorphicChartProps {
  const renderingContext = {
    getColor: createColorGetter(options.colors),
    formatValue: formatStaticValue,
    measureText: measureTextWidth,
    fontFamily: "Lato", // TODO make this based on admin settings value
  };

  // Only the isomorphic, echarts-based charts use rawSeries
  // and are guranteed to have card and data parameters provided from
  // resources/frontend_shared/static_viz_interface.js
  if (!ISOMORPHIC_CHART_TYPES.includes(type)) {
    return { rawSeries: [], renderingContext };
  }

  // Not a thorough type validation but at least we can make sure
  // these are present.
  if (options.card == null || typeof options.card !== "object") {
    throw Error(`Invalid options.card parameter: ${options.card}`);
  }
  if (options.data == null || typeof options.data !== "object") {
    throw Error(`Invalid options.data parameter: ${options.data}`);
  }

  return {
    rawSeries: [{ card: options.card, data: options.data }] as RawSeries,
    renderingContext,
  };
}
