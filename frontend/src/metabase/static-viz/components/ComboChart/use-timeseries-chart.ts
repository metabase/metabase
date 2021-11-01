import { scaleBand, scaleLinear } from "@visx/scale";
import { ChartSize, Series } from "../blocks/types";
import {
  getDateXDomainForMultipleSeries,
  getNumericYDomainForMultipleSeries,
} from "../blocks/utils/domain";
import { getX, getXRangeMax, getYRangeMax } from "../blocks/utils/scale";

export const useTimeseriesChart = (
  series: Series<Date, number>[],
  size: ChartSize,
) => {
  // X-axis
  const xDomain = getDateXDomainForMultipleSeries(series);
  const xRangeMax = getXRangeMax(size);

  const xScale = scaleBand({
    domain: series
      .flatMap(series => series.data)
      .map(datum => getX(datum).valueOf()),

    range: [0, xRangeMax],
    round: true,
    padding: 0.1,
  });

  // Y-axis
  const yDomain = getNumericYDomainForMultipleSeries(series);
  const yRangeMax = getYRangeMax(size);
  const yScale = scaleLinear<number>({
    range: [yRangeMax, 0],
    domain: yDomain,
    nice: true,
  });

  return {
    xDomain,
    xScale,
    xRangeMax,
    yScale,
    yRangeMax,
  } as const;
};
