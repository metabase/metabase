import { P, match } from "ts-pattern";
import _ from "underscore";

import {
  AM_PM_OPTIONS,
  HOUR_OPTIONS,
  getDayOfWeekOptions,
} from "metabase/lib/date-time";
import type { Channel } from "metabase-types/api";

export type GetScheduleTextProps = {
  schedule: Pick<Channel, "schedule_type" | "schedule_day" | "schedule_hour">;
  verbose: boolean;
};

export const getScheduleText = ({
  schedule,
  verbose,
}: GetScheduleTextProps) => {
  const dayOfWeekOptions = getDayOfWeekOptions();
  const hourOfDay = schedule.schedule_hour;
  const hour = hourOfDay
    ? _.find(HOUR_OPTIONS, opt => opt.value === hourOfDay % 12)?.name
    : null;
  const amPm = hourOfDay
    ? _.find(AM_PM_OPTIONS, opt => opt.value === (hourOfDay >= 12 ? 1 : 0))
        ?.name
    : null;

  const day = _.find(
    dayOfWeekOptions,
    o => o.value === schedule.schedule_day,
  )?.name;

  return match([schedule.schedule_type, verbose, hourOfDay])
    .returnType<string | null>()
    .with(["hourly", true, P._], () => "hourly")
    .with(["hourly", false, P._], () => "Hourly")
    .with(["daily", true, P.nonNullable], () => `daily at ${hour} ${amPm}`)
    .with(["daily", false, P.nonNullable], () => `Daily, ${hour} ${amPm}`)
    .with(
      ["weekly", true, P.nonNullable],
      () => `weekly on ${day}s at ${hour} ${amPm}`,
    )
    .with(
      ["weekly", false, P.nonNullable],
      () => `${day}s, ${hour?.substring(0, hour?.indexOf(":"))} ${amPm}`,
    )
    .otherwise(() => null);
};
