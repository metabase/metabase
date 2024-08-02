import _ from "underscore";

import {
  AM_PM_OPTIONS,
  getDayOfWeekOptions,
  HOUR_OPTIONS,
} from "metabase/lib/date-time";
import { Box, Text } from "metabase/ui";
import type { Channel } from "metabase-types/api";

const getScheduleText = ({ schedule, verbose }: AlertScheduleTextProps) => {
  const scheduleType = schedule.schedule_type;
  const hourOfDay = schedule.schedule_hour;

  // these are pretty much copy-pasted from SchedulePicker
  if (scheduleType === "hourly") {
    return verbose ? "hourly" : "Hourly";
  } else if (scheduleType === "daily" && hourOfDay) {
    const hour = _.find(
      HOUR_OPTIONS,
      opt => opt.value === hourOfDay % 12,
    )?.name;
    const amPm = _.find(
      AM_PM_OPTIONS,
      opt => opt.value === (hourOfDay >= 12 ? 1 : 0),
    )?.name;

    return `${verbose ? "daily at " : "Daily, "} ${hour} ${amPm}`;
  } else if (scheduleType === "weekly" && hourOfDay) {
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

    if (!hour) {
      return;
    }

    if (verbose) {
      return `weekly on ${day}s at ${hour} ${amPm}`;
    } else {
      // omit the minute part of time
      return `${day}s, ${hour.substring(0, hour.indexOf(":"))} ${amPm}`;
    }
  }
};

type AlertScheduleTextProps = {
  schedule: Channel;
  verbose: boolean;
};

export const AlertScheduleText = ({
  schedule,
  verbose,
}: AlertScheduleTextProps) => (
  <Box component="span">
    <Text fw={verbose ? "bold" : "normal"}>
      {getScheduleText({ schedule, verbose })}
    </Text>
  </Box>
);
