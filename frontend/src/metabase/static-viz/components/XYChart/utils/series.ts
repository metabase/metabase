import _ from "underscore";

import type {
  Series,
  SeriesDatum,
  XAxisType,
  StackedDatum,
} from "metabase/static-viz/components/XYChart/types";

export const getX = (d: SeriesDatum | StackedDatum) => d[0];
export const getY = (d: SeriesDatum | StackedDatum) => d[1];
export const setY = <T extends SeriesDatum | StackedDatum>(
  d: T,
  value: number,
): T => {
  const newDatum = [...d];
  newDatum[1] = value;
  return newDatum as T;
};

export const getY1 = (d: StackedDatum) => d[2];

export const partitionByYAxis = (series: Series[]) => {
  return _.partition(
    series,
    series => series.yAxisPosition === "left" || series.yAxisPosition == null,
  );
};

export const sortSeries = (series: Series[], type: XAxisType) => {
  if (type === "ordinal") {
    return series;
  }

  return series.map(s => {
    const sortedData = s.data.slice().sort((left, right) => {
      const leftX = getX(left);
      const rightX = getX(right);

      if (type === "timeseries") {
        return new Date(leftX).valueOf() - new Date(rightX).valueOf();
      }

      return Number(leftX) - Number(rightX);
    });

    return {
      ...s,
      data: sortedData,
    };
  });
};

export const calculateStackedItems = (multipleSeries: Series[]) => {
  const dimensionSeriesIndexMap: Record<
    string,
    Record<number, SeriesDatum>
  > = {};

  multipleSeries.forEach((series, seriesIndex) => {
    series.data.forEach(datum => {
      const dimension = getX(datum);
      if (!dimensionSeriesIndexMap[dimension]) {
        dimensionSeriesIndexMap[dimension] = {};
      }
      dimensionSeriesIndexMap[dimension][seriesIndex] = datum;
    });
    return dimensionSeriesIndexMap;
  });

  // Stacked charts work only for a single dataset with one dimension
  return multipleSeries.map((series, seriesIndex) => {
    const stackedData = series.data.map(datum => {
      const [x, y] = datum;

      let y1 = 0;

      for (let i = 0; i < seriesIndex; i++) {
        const currentDatum = dimensionSeriesIndexMap[x][i];
        if (!currentDatum) {
          continue;
        }
        const currentY = getY(currentDatum);

        const hasSameSign = (y > 0 && currentY > 0) || (y < 0 && currentY < 0);
        if (hasSameSign) {
          y1 += currentY;
        }
      }

      const stackedDatum: StackedDatum = [x, y1 + y, y1];
      return stackedDatum;
    });

    return {
      ...series,
      stackedData,
    };
  });
};
