import { t } from "ttag";

import type { CartesianChartDateTimeAbsoluteUnit } from "metabase/visualizations/echarts/cartesian/model/types";

export const DATETIME_ABSOLUTE_UNIT_COMPARISON: Record<
  CartesianChartDateTimeAbsoluteUnit,
  string
> = {
  year: t`Compared to previous year`,
  quarter: t`Compared to previous quarter`,
  month: t`Compared to previous month`,
  week: t`Compared to previous week`,
  day: t`Compared to previous day`,
  hour: t`Compared to previous hour`,
  minute: t`Compared to previous minute`,
  second: t`Compared to previous second`,
  ms: t`Compared to previous millisecond`,
};
