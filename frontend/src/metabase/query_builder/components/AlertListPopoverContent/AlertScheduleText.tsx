import { match } from "ts-pattern";
import _ from "underscore";

import {
  AM_PM_OPTIONS,
  getDayOfWeekOptions,
  HOUR_OPTIONS,
} from "metabase/lib/date-time";
import { Box, Text } from "metabase/ui";
import type { Channel } from "metabase-types/api";

export const AlertScheduleText = ({
  schedule,
  verbose,
}: {
  schedule: Channel;
  verbose: boolean;
}) => {
  const scheduleType = schedule.schedule_type;

  if (!scheduleType) {
    return null;
  }

  const hourOfDay = schedule.schedule_hour;

  const dayOfWeekOptions = getDayOfWeekOptions();

  const day = _.find(
    dayOfWeekOptions,
    o => o.value === schedule.schedule_day,
  )?.name;
  const hour = _.find(
    HOUR_OPTIONS,
    opt => !!hourOfDay && opt.value === hourOfDay % 12,
  )?.name;
  const amPm = _.find(
    AM_PM_OPTIONS,
    opt => !!hourOfDay && opt.value === (hourOfDay >= 12 ? 1 : 0),
  )?.name;

  const scheduleText = match([scheduleType, verbose])
    .returnType<string | null>()
    .with(["hourly", true], () => "hourly")
    .with(["hourly", false], () => "Hourly")
    .with(["daily", true], () => "daily at " + hour + " " + amPm)
    .with(["daily", false], () => "Daily, " + hour + " " + amPm)
    .with(["weekly", true], () => `weekly on ${day}s at ${hour} ${amPm}`)
    .with(["weekly", false], () => {
      return hour
        ? `${day}s, ${hour.substring(0, hour.indexOf(":"))} ${amPm}`
        : null;
    })
    .otherwise(() => null);

  return (
    <Box component="span">
      <Text fw={verbose ? "bold" : "normal"}>{scheduleText}</Text>
    </Box>
  );
};
