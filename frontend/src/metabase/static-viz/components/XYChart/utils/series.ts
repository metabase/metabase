import _ from "underscore";
import {
  Series,
  SeriesDatum,
} from "metabase/static-viz/components/XYChart/types";

export const getX = (d: SeriesDatum) => d[0];
export const getY = (d: SeriesDatum) => d[1];

export const partitionByYAxis = (series: Series[]) => {
  return _.partition(
    series,
    series => series.yAxisPosition === "left" || series.yAxisPosition == null,
  );
};
