import _ from "underscore";
import {
  Series,
  SeriesDatum,
  XAxisType,
  StackedDatum,
} from "metabase/static-viz/components/XYChart/types";

export const getX = (d: SeriesDatum | StackedDatum) => d[0];
export const getY = (d: SeriesDatum | StackedDatum) => d[1];

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

export const calculateStackedItems = (series: Series[]) => {
  // Stacked charts work only for a single dataset with one dimension
  return series.map((s, seriesIndex) => {
    const stackedData = s.data.map((datum, datumIndex) => {
      const [x, y] = datum;

      let y1 = 0;

      for (let i = 0; i < seriesIndex; i++) {
        const currentY = getY(series[i].data[datumIndex]);

        const hasSameSign = (y > 0 && currentY > 0) || (y < 0 && currentY < 0);
        if (hasSameSign) {
          y1 += currentY;
        }
      }

      const stackedDatum: StackedDatum = [x, y1 + y, y1];
      return stackedDatum;
    });

    return {
      ...s,
      stackedData,
    };
  });
};
