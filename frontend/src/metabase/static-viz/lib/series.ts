import { Datum, Series } from "../components/types";

export const getX = <X, Y>(d: Datum<X, Y>) => d[0];
export const getY = <X, Y>(d: Datum<X, Y>) => d[1];

export const getDateXDomain = (data: Datum<Date, unknown>[]) => {
  return [
    Math.min(...data.map(datum => getX(datum).valueOf())),
    Math.max(...data.map(datum => getX(datum).valueOf())),
  ];
};

export const getDateXDomainForMultipleSeries = (
  series: Series<Date, unknown>[],
) => {
  return getDateXDomain(series.flatMap(series => series.data));
};

export const getNumericYDomain = (data: Datum<unknown, number>[]) => {
  return [
    Math.min(...data.map(datum => getY(datum).valueOf())),
    Math.max(...data.map(datum => getY(datum).valueOf())),
  ];
};

export const getNumericYDomainForMultipleSeries = (
  series: Series<unknown, number>[],
) => {
  return getNumericYDomain(series.flatMap(series => series.data));
};
