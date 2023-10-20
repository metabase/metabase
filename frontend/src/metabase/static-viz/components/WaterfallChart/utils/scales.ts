import d3 from "d3";
import { scaleBand, scaleLinear, scaleTime } from "@visx/scale";
import { getX } from "metabase/static-viz/components/Values/utils/series";
import type { Range } from "metabase/visualizations/shared/types/scale";
import type {
  SeriesDatum,
  XAxisType,
  Series,
  XScale,
} from "metabase/static-viz/components/Values/types";

export const createXScale = (
  series: Series[],
  range: Range,
  axisType: XAxisType,
): XScale => {
  const isOrdinal = axisType === "ordinal";

  if (isOrdinal) {
    const domain = series
      .flatMap(series => series.data)
      .map(datum => getX(datum).valueOf());

    const xScale = scaleBand({
      domain,
      range,
      padding: 0.2,
    });

    return {
      scale: xScale,
      bandwidth: xScale.bandwidth(),
      lineAccessor: (datum: SeriesDatum) =>
        (xScale(getX(datum)) || 0) + xScale.bandwidth() / 2,
    };
  }

  if (axisType === "timeseries") {
    const values = series
      .flatMap(series => series.data)
      .map(datum => new Date(getX(datum)).valueOf());
    const domain = d3.extent(values);
    const xScale = scaleTime({
      range,
      domain,
    });

    return {
      scale: xScale,
      lineAccessor: (datum: SeriesDatum) =>
        xScale(new Date(getX(datum).valueOf())),
    };
  }

  const values = series
    .flatMap(series => series.data)
    .map(datum => parseInt(getX(datum).toString()));
  const domain = d3.extent(values);
  const xScale = scaleLinear({
    range,
    domain,
  });

  return {
    scale: xScale,
    lineAccessor: (datum: SeriesDatum) =>
      xScale(parseInt(getX(datum).toString())),
  };
};
