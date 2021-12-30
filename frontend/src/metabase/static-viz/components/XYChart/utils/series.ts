import _ from "underscore";
import {
  Series,
  SeriesDatum,
  XAxisType,
} from "metabase/static-viz/components/XYChart/types";

export const getX = (d: SeriesDatum) => d[0];
export const getY = (d: SeriesDatum) => d[1];

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
