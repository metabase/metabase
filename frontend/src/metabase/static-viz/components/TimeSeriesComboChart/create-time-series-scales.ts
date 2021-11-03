import { scaleBand, scaleLinear } from "@visx/scale";
import {
  getNumericYDomainForMultipleSeries,
  getX,
} from "metabase/static-viz/lib/series";
import { Dimensions, Series } from "../types";

export const createTimeSeriesScales = (
  series: Series<Date, number>[],
  bounds: Dimensions,
) => {
  const xScale = scaleBand({
    domain: series
      .flatMap(series => series.data)
      .map(datum => getX(datum).valueOf()),
    range: [0, bounds.width],
    round: true,
    padding: 0.1,
  });

  const yScale = scaleLinear<number>({
    range: [bounds.height, 0],
    domain: getNumericYDomainForMultipleSeries(series),
    nice: true,
  });

  return {
    xScale,
    yScale,
  } as const;
};
