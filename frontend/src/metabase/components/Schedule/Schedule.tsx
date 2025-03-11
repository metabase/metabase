import { type HTMLAttributes, useCallback, useMemo } from "react";
import { match } from "ts-pattern";
import { c } from "ttag";
import _ from "underscore";

import { removeNullAndUndefinedValues } from "metabase/lib/types";
import { Box, type BoxProps } from "metabase/ui";
import type { ScheduleSettings, ScheduleType } from "metabase-types/api";

import { GroupControlsTogether } from "./GroupControlsTogether";
import S from "./Schedule.module.css";
import {
  SelectFrame,
  SelectFrequency,
  SelectMinute,
  SelectTime,
  SelectWeekday,
  SelectWeekdayOfMonth,
} from "./components";
import { defaultDay, scheduleDefaults } from "./constants";
import type { ScheduleChangeProp, UpdateSchedule } from "./types";

export interface ScheduleProps {
  schedule: ScheduleSettings;
  scheduleOptions: ScheduleType[];
  onScheduleChange: (
    nextSchedule: ScheduleSettings,
    change: ScheduleChangeProp,
  ) => void;
  timezone?: string;
  verb?: string;
  textBeforeSendTime?: string;
  minutesOnHourPicker?: boolean;
}

export const Schedule = ({
  schedule,
  scheduleOptions,
  timezone,
  verb,
  minutesOnHourPicker,
  onScheduleChange,
  ...boxProps
}: {
  schedule: ScheduleSettings;
  scheduleOptions: ScheduleType[];
  timezone?: string;
  verb?: string;
  minutesOnHourPicker?: boolean;
  onScheduleChange: (
    nextSchedule: ScheduleSettings,
    change: ScheduleChangeProp,
  ) => void;
} & BoxProps &
  HTMLAttributes<HTMLDivElement>) => {
  const updateSchedule: UpdateSchedule = useCallback(
    (field: keyof ScheduleSettings, value: ScheduleSettings[typeof field]) => {
      let newSchedule: ScheduleSettings = {
        ...schedule,
        [field]: value,
      };

      newSchedule = removeNullAndUndefinedValues(newSchedule);

      if (field === "schedule_type") {
        newSchedule = {
          ...newSchedule,
          ...scheduleDefaults[value as ScheduleType],
        };
      } else if (field === "schedule_frame") {
        // when the monthly schedule frame is the 15th, clear out the schedule_day
        if (value === "mid") {
          newSchedule = { ...newSchedule, schedule_day: null };
        } else {
          // first or last, needs a day of the week
          newSchedule = {
            schedule_day: newSchedule.schedule_day || defaultDay,
            ...newSchedule,
          };
        }
      }

      onScheduleChange(newSchedule, { name: field, value });
    },
    [onScheduleChange, schedule],
  );

  const renderedSchedule = useMemo(() => {
    // Merge default values into the schedule
    const scheduleWithDefaults: ScheduleSettings = _.defaults(
      schedule,
      schedule.schedule_type ? scheduleDefaults[schedule.schedule_type] : {},
    );

    const {
      schedule_type,
      schedule_frame,
      schedule_day,
      schedule_hour,
      schedule_minute,
    } = scheduleWithDefaults;

    const selectFrequency = (
      <SelectFrequency
        key="frequency"
        updateSchedule={updateSchedule}
        scheduleType={schedule_type}
        scheduleOptions={scheduleOptions}
      />
    );

    const selectMinute = (
      <SelectMinute
        key="minute"
        schedule_minute={schedule_minute}
        updateSchedule={updateSchedule}
      />
    );

    const selectTime = (
      <SelectTime
        key="time"
        schedule_hour={schedule_hour}
        updateSchedule={updateSchedule}
        timezone={timezone}
      />
    );

    const selectWeekday = (
      <SelectWeekday
        key="weekday"
        schedule_day={schedule_day}
        updateSchedule={updateSchedule}
      />
    );

    const selectFrame = (
      <SelectFrame
        key="frame"
        schedule_frame={schedule_frame}
        updateSchedule={updateSchedule}
      />
    );

    const selectWeekdayOfMonth = (
      <SelectWeekdayOfMonth
        key="wom"
        schedule_day={schedule_day}
        updateSchedule={updateSchedule}
      />
    );

    return match(schedule_type)
      .with("hourly", () => {
        return minutesOnHourPicker
          ? // For example, "Send hourly at 15 minutes past the hour"
            c(
              "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a number of minutes",
            )
              .jt`${verb} ${selectFrequency} at ${selectMinute} minutes past the hour`
          : // For example, "Send hourly"
            `${verb} ${selectFrequency}`;
      })
      .with(
        "daily",
        () =>
          // For example, "Send daily at 12:00pm"
          c(
            "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a time like '12:00pm'",
          ).jt`${verb} ${selectFrequency} at ${selectTime}`,
      )
      .with(
        "weekly",
        () =>
          // For example, "Send weekly on Tuesday at 12:00pm"
          c(
            "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a day like 'Tuesday', {3} is a time like '12:00pm'",
          ).jt`${verb} ${selectFrequency} on ${selectWeekday} at ${selectTime}`,
      )
      .with("monthly", () =>
        schedule_frame === "mid"
          ? // For example, "Send monthly on the 15th at 12:00pm"
            c(
              "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is the noun '15th' (as in 'the 15th of the month'), {3} is a time like '12:00pm'",
            )
              .jt`${verb} ${selectFrequency} on the ${selectFrame} at ${selectTime}`
          : // For example, "Send monthly on the first Tuesday at 12:00pm"
            c(
              "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is an adjective like 'first', {3} is a day like 'Tuesday', {4} is a time like '12:00pm'",
            ).jt`${verb} ${selectFrequency} on the ${selectFrame} ${
              selectWeekdayOfMonth
            } at ${selectTime}`,
      )
      .with(null, () => null)
      .with(undefined, () => null)
      .exhaustive();
  }, [
    minutesOnHourPicker,
    schedule,
    scheduleOptions,
    timezone,
    updateSchedule,
    verb,
  ]);

  return (
    <Box className={S.Schedule} {...boxProps}>
      <GroupControlsTogether>{renderedSchedule}</GroupControlsTogether>
    </Box>
  );
};
