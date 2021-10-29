import { scaleBand, scaleLinear, scaleTime } from "@visx/scale";
import { ChartSize, Series } from "./types";
import {
  getDateXDomainForMultipleSeries,
  getNumericYDomainForMultipleSeries,
} from "./utils/domain";
import { getXRangeMax, getYRangeMax } from "./utils/scale";
import { getXTicksCount, getYTicksCount } from "./utils/ticks";

export const useTimeseriesChart = (
  series: Series<Date, number>[],
  size: ChartSize,
) => {
  // X-axis
  const xDomain = getDateXDomainForMultipleSeries(series);
  const xRangeMax = getXRangeMax(size);
  const xScale = scaleTime({
    domain: xDomain,
    range: [0, xRangeMax],
    nice: true,
  });
  const xTicks = getXTicksCount(size.dimensions.width);

  const xScaleBand = scaleBand({
    domain: series
      .flatMap(series => series.data)
      .map(datum => datum[0].valueOf()),
    range: [0, xRangeMax],
    round: true,
    padding: 0.2,
  });

  // Y-axis
  const yDomain = getNumericYDomainForMultipleSeries(series);
  const yRangeMax = getYRangeMax(size);
  const yScale = scaleLinear<number>({
    range: [yRangeMax, 0],
    domain: yDomain,
    nice: true,
  });

  const yTicks = getYTicksCount(size.dimensions.height);

  return {
    xDomain,
    xScale,
    xScaleBand,
    xTicks,
    xRangeMax,
    yScale,
    yTicks,
    yRangeMax,
  } as const;
};
