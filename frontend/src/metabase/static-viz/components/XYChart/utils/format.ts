import { formatDate } from "../../../lib/dates";
import { formatNumber } from "../../../lib/numbers";
import { ColumnValue } from "../../ComboChart/types";
import { ChartSettings, XAxisType } from "../types";

export const formatXTick = (
  value: ColumnValue,
  xAxisType: XAxisType,
  formatSettings: ChartSettings["x"]["format"],
) => {
  if (xAxisType === "timeseries") {
    return formatDate(new Date(value as string).valueOf(), formatSettings);
  }

  if (xAxisType !== "ordinal") {
    return formatNumber(value, formatSettings);
  }

  return value;
};
