import { match } from "ts-pattern";
import { ScheduleSettings } from "metabase-types/api";
import _ from "underscore";
import {
  AM_PM_OPTIONS,
  getDayOfWeekOptions,
  HOUR_OPTIONS,
} from "metabase/lib/date-time";

export const AlertScheduleText2 = ({
  schedule,
  verbose,
}: {
  schedule: ScheduleSettings;
  verbose?: boolean;
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
  const hour = _.find(HOUR_OPTIONS, opt => opt.value === hourOfDay % 12)?.name;
  const amPm = _.find(
    AM_PM_OPTIONS,
    opt => hourOfDay && opt.value === (hourOfDay >= 12 ? 1 : 0),
  )?.name;

  match([scheduleType, verbose])
    .with(["hourly", true], () => "hourly")
    .with(["hourly", false], () => "Hourly")
    .with(["daily", true], () => "daily at " + hour + " " + amPm)
    .with(["daily", false], () => "Daily, " + hour + " " + amPm)
    .with(["weekly", true], () => `weekly on ${day}s at ${hour} ${amPm}`)
    .with(
      ["weekly", false],
      () => `${day}s, ${hour.substr(0, hour.indexOf(":"))} ${amPm}`,
    );
};
