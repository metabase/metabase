import type {
  CategoryXAxisModel,
  NumericXAxisModel,
  TimeSeriesXAxisModel,
  XAxisModel,
} from "./types";

export const isTimeSeriesAxis = (
  axisModel: XAxisModel,
): axisModel is TimeSeriesXAxisModel => {
  return axisModel.axisType === "time";
};

export const isNumericAxis = (
  axisModel: XAxisModel,
): axisModel is NumericXAxisModel => {
  return axisModel.axisType === "value";
};

export const isCategoryAxis = (
  axisModel: XAxisModel,
): axisModel is CategoryXAxisModel => {
  return axisModel.axisType === "category";
};
