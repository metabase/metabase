import type { TimeSeriesXAxisModel, XAxisModel } from "./types";

export const isTimeSeriesAxis = (
  axisModel: XAxisModel,
): axisModel is TimeSeriesXAxisModel => {
  return axisModel.axisType === "time";
};
