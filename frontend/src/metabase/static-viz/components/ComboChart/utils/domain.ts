import { Datum, Series } from "../types";

export const getDateXDomain = (data: Datum<Date, unknown>[]) => {
  return [
    Math.min(...data.map(datum => datum[0].valueOf())),
    Math.max(...data.map(datum => datum[0].valueOf())),
  ];
};

export const getDateXDomainForMultipleSeries = (
  series: Series<Date, unknown>[],
) => {
  return getDateXDomain(series.flatMap(series => series.data));
};

export const getNumericYDomain = (data: Datum<unknown, number>[]) => {
  return [
    Math.min(...data.map(datum => datum[1].valueOf())),
    Math.max(...data.map(datum => datum[1].valueOf())),
  ];
};

export const getNumericYDomainForMultipleSeries = (
  series: Series<unknown, number>[],
) => {
  return getNumericYDomain(series.flatMap(series => series.data));
};
