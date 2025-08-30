import dayjs from "dayjs";

import type {
  BaseCartesianChartModel,
  DataKey,
  TimeSeriesInterval,
} from "../model/types";

export function getSeriesYAxisIndex(
  dataKey: DataKey,
  chartModel: BaseCartesianChartModel,
): number {
  const { leftAxisModel, rightAxisModel } = chartModel;
  const hasSingleYAxis = leftAxisModel == null || rightAxisModel == null;

  if (hasSingleYAxis) {
    return 0;
  }

  return leftAxisModel.seriesKeys.includes(dataKey) ? 0 : 1;
}

export const coerceYear = (iv: TimeSeriesInterval): TimeSeriesInterval =>
  iv.unit === "month" && iv.count === 12 ? { unit: "year", count: 1 } : iv;

export const coerceAnnualFromMonthly = (
  dates: Date[],
  iv: TimeSeriesInterval,
): TimeSeriesInterval => {
  if (iv.unit !== "month" || iv.count !== 1 || dates.length < 2) {
    return iv;
  }

  const months = dates.map((d) => dayjs(d).month());
  const days = dates.map((d) => dayjs(d).date());
  const years = dates.map((d) => dayjs(d).year());

  const sameMonth = months.every((m) => m === months[0]);
  const sameDay = days.every((dd) => dd === days[0]);
  const multiYear = new Set(years).size > 1;

  return sameMonth && sameDay && multiYear ? { unit: "year", count: 1 } : iv;
};
