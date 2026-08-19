import type {
  DateRange,
  TimeSeriesInterval,
} from "metabase/visualizations/echarts/cartesian/model/types";

export interface TimeseriesXAxis {
  domain: DateRange | null;
  interval: TimeSeriesInterval | null;
}
