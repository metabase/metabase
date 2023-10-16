import type { RawSeries } from "metabase-types/api";
import { createColorGetter } from "metabase/static-viz/lib/colors";
import { formatStaticValue } from "metabase/static-viz/lib/format";
import { measureTextWidth } from "metabase/lib/measure-text";

import type { IsomorphicChartProps } from "./types";

export function getIsomorhpicProps(options: any): IsomorphicChartProps {
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
    renderingContext: {
      getColor: createColorGetter(options.colors),
      formatValue: formatStaticValue,
      measureText: measureTextWidth,
      fontFamily: "Lato", // TODO make this based on admin settings value
    },
  };
}
