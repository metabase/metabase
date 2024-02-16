import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type { RowValue } from "metabase-types/api";
import type {
  CartesianChartDateTimeAbsoluteUnit,
  TimeSeriesInterval,
} from "metabase/visualizations/echarts/cartesian/model/types";

const getApproximateUnitDurationMs = (
  unit: CartesianChartDateTimeAbsoluteUnit,
) => {
  switch (unit) {
    case "ms":
      return 1;
    case "second":
      return 1000;
    case "minute":
      return 60 * 1000;
    case "hour":
      return 60 * 60 * 1000;
    case "day":
      return 24 * 60 * 60 * 1000;
    case "week":
      return 7 * 24 * 60 * 60 * 1000;
    case "month":
      return 28 * 24 * 60 * 60 * 1000;
    case "quarter":
      return 3 * 30 * 24 * 60 * 60 * 1000;
    case "year":
      return 365 * 24 * 60 * 60 * 1000;
    default:
      throw Error(`Unsupported unit ${unit}`);
  }
};

export const getTimeSeriesMinInterval = ({
  interval,
  count,
}: TimeSeriesInterval) => {
  return getApproximateUnitDurationMs(interval) * count;
};

export const tryGetDate = (rowValue: RowValue): Dayjs | null => {
  if (typeof rowValue === "boolean") {
    return null;
  }
  const date = dayjs(rowValue);
  return date.isValid() ? date : null;
};
