import React from "react";

import { MomentInput } from "moment-timezone";

import {
  format_datetime_with_unit,
  format_for_parameter,
  format_range_with_unit,
} from "cljs/metabase.shared.formatting.date";
import type { DatetimeUnit } from "metabase-types/api/query";
import { isDateWithoutTime } from "metabase-lib/types/utils/isa";

import type { OptionsType } from "./types";

const RANGE_SEPARATOR = ` \u2013 `;

export function formatDateTimeForParameter(value: string, unit: DatetimeUnit) {
  return format_for_parameter(value, { unit });
}

/** This formats a time with unit as a date range */
export function formatDateTimeRangeWithUnit(
  value: string | number,
  unit: DatetimeUnit,
  options: OptionsType = {},
) {
  return format_range_with_unit(value, { ...options, unit });
}

// TODO This function has nothing to do with date formatting specifically and
// should be moved to a more general library.
export function formatRange(
  range: any[],
  formatter: any,
  options: OptionsType = {},
) {
  const [start, end] = range.map(value => formatter(value, options));
  if ((options.jsx && typeof start !== "string") || typeof end !== "string") {
    return (
      <span>
        {start} {RANGE_SEPARATOR} {end}
      </span>
    );
  } else {
    return `${start} ${RANGE_SEPARATOR} ${end}`;
  }
}

export function formatDateTimeWithUnit(
  value: MomentInput,
  unit: DatetimeUnit,
  options: OptionsType = {},
) {
  const fullOptions = {
    ...options,
    unit,
  };

  // Handle one FE-only concern before handing off to the CLJC library:
  // columns marked as date-only should disable including the time.
  if (isDateWithoutTime(options.column)) {
    // Explicitly setting time_enabled to null will ensure the time is ignored.
    fullOptions.time_enabled = null;
  }

  return format_datetime_with_unit(value, fullOptions);
}
