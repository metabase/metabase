import { useCallback } from "react";
import _ from "underscore";

import {
  AM_PM_OPTIONS,
  HOUR_OPTIONS,
  getDayOfWeekOptions,
} from "metabase/lib/date-time";
import { isNullOrUndefined } from "metabase/lib/types";
import type { Channel } from "metabase-types/api";

type AlertScheduleTextProps = {
  schedule: Channel;
  verbose?: boolean;
};

export const AlertScheduleText = ({
  schedule,
  verbose,
}: AlertScheduleTextProps) => {
  const getScheduleText = useCallback(() => {
    const scheduleType = schedule.schedule_type;

    if (!scheduleType) {
      return null;
    }

    // these are pretty much copy-pasted from SchedulePicker
    if (scheduleType === "hourly") {
      return verbose ? "hourly" : "Hourly";
    } else if (scheduleType === "daily") {
      const hourOfDay = schedule.schedule_hour;

      if (isNullOrUndefined(hourOfDay)) {
        return null;
      }

      const hour = _.find(
        HOUR_OPTIONS,
        opt => opt.value === hourOfDay % 12,
      )?.name;
      const amPm = _.find(
        AM_PM_OPTIONS,
        opt => opt.value === (hourOfDay >= 12 ? 1 : 0),
      )?.name;

      return `${verbose ? "daily at " : "Daily, "} ${hour} ${amPm}`;
    } else if (scheduleType === "weekly") {
      const hourOfDay = schedule.schedule_hour;
      if (isNullOrUndefined(hourOfDay)) {
        return null;
      }

      const dayOfWeekOptions = getDayOfWeekOptions();

      const day = _.find(
        dayOfWeekOptions,
        o => o.value === schedule.schedule_day,
      )?.name;
      const hour = _.find(
        HOUR_OPTIONS,
        opt => opt.value === hourOfDay % 12,
      )?.name;
      const amPm = _.find(
        AM_PM_OPTIONS,
        opt => opt.value === (hourOfDay >= 12 ? 1 : 0),
      )?.name;

      if (verbose) {
        return `weekly on ${day}s at ${hour} ${amPm}`;
      } else {
        // omit the minute part of time
        return `${day}s, ${hour?.substring(0, hour.indexOf(":"))} ${amPm}`;
      }
    }
  }, [schedule, verbose]);

  const scheduleText = getScheduleText();

  if (verbose) {
    return (
      <span>
        Checking <b>{scheduleText}</b>
      </span>
    );
  } else {
    return <span>{scheduleText}</span>;
  }
};
