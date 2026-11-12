import type {
  DateRange,
  TimeSeriesInterval,
} from "../echarts/cartesian/model/types";

export interface TimeseriesXAxis {
  domain: DateRange | null;
  interval: TimeSeriesInterval | null;
}
