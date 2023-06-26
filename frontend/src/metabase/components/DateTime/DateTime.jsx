import PropTypes from "prop-types";

import { formatDateTimeWithUnit } from "metabase/lib/formatting";
import MetabaseSettings from "metabase/lib/settings";

// Mirrors DatetimeUnit type, as it's used in date formatting utility fn
// Type: https://github.com/metabase/metabase/blob/8778569c56beb573b0e688d49edba327b8ae62ab/frontend/src/metabase-types/api/query.ts#L31
export const DATE_TIME_UNITS = [
  "default",
  "minute",
  "minute-of-hour",
  "hour",
  "hour-of-day",
  "day",
  "day-of-week",
  "day-of-month",
  "day-of-year",
  "week",
  "week-of-year",
  "month",
  "month-of-year",
  "quarter",
  "quarter-of-year",
  "year",
];

const propTypes = {
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.instanceOf(Date),
    PropTypes.number, // UNIX timestamp
  ]).isRequired,
  unit: PropTypes.oneOf(DATE_TIME_UNITS),
};

function DateTime({ value, unit = "default", ...props }) {
  const options = MetabaseSettings.formattingOptions();
  const formattedTime = formatDateTimeWithUnit(value, unit, options);

  return <span {...props}>{formattedTime}</span>;
}

DateTime.propTypes = propTypes;

export default DateTime;
