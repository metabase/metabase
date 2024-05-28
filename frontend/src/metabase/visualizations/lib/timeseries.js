import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import _ from "underscore";

import { isDate } from "metabase-lib/v1/types/utils/isa";

const TIMESERIES_UNITS = new Set([
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year", // https://github.com/metabase/metabase/issues/1992
]);

// investigate the response from a dataset query and determine if the dimension is a timeseries
export function dimensionIsTimeseries({ cols, rows }, i = 0) {
  return (
    dimensionIsExplicitTimeseries({ cols, rows }, i) ||
    moment(rows[0] && rows[0][i], moment.ISO_8601).isValid()
  );
}

export function dimensionIsExplicitTimeseries({ cols }, i) {
  return (
    isDate(cols[i]) &&
    (cols[i].unit == null || TIMESERIES_UNITS.has(cols[i].unit))
  );
}
