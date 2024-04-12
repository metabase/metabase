import { useCallback } from "react";
import { c } from "ttag";
import { pick } from "underscore";

import { capitalize } from "metabase/lib/formatting/strings";
import { Box } from "metabase/ui";
import type { ScheduleSettings, ScheduleType } from "metabase-types/api";

import {
  AutoWidthSelect,
  SelectWeekday,
  SelectTime,
  SelectMinute,
  SelectFrame,
  SelectWeekdayOfMonth,
  DisplayTimeDetails,
} from "./components";
import { defaultDay, optionNameTranslations } from "./constants";
import type { UpdateSchedule, ScheduleChangeProp } from "./types";

const getOptionName = (option: ScheduleType) =>
  optionNameTranslations[option] || capitalize(option);

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

const defaults: Record<string, Partial<ScheduleSettings>> = {
  hourly: {
    schedule_day: null,
    schedule_frame: null,
    schedule_hour: null,
    schedule_minute: 0,
  },
  daily: {
    schedule_day: null,
    schedule_frame: null,
  },
  weekly: {
    schedule_day: defaultDay,
    schedule_frame: null,
  },
  monthly: {
    schedule_frame: "first",
    schedule_day: defaultDay,
  },
};

export const Schedule = ({
  schedule,
  scheduleOptions,
  timezone,
  verb,
  textBeforeSendTime,
  minutesOnHourPicker,
  onScheduleChange,
}: {
  schedule: ScheduleSettings;
  scheduleOptions: ScheduleType[];
  timezone?: string;
  verb?: string;
  textBeforeSendTime?: string;
  minutesOnHourPicker?: boolean;
  onScheduleChange: (
    nextSchedule: ScheduleSettings,
    change: ScheduleChangeProp,
  ) => void;
}) => {
  const updateSchedule: UpdateSchedule = useCallback(
    (field, value) => {
      let newSchedule: ScheduleSettings = {
        ...schedule,
        [field]: value,
      };

      newSchedule = pick(newSchedule, val => val);

      if (field === "schedule_type") {
        newSchedule = {
          ...defaults[value as ScheduleType],
          ...newSchedule,
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

  return (
    <Box lh="41px" display="flex" style={{ flexWrap: "wrap", gap: ".5rem" }}>
      <ScheduleBody
        schedule={schedule}
        updateSchedule={updateSchedule}
        scheduleOptions={scheduleOptions}
        timezone={timezone}
        verb={verb}
        textBeforeSendTime={textBeforeSendTime}
        minutesOnHourPicker={minutesOnHourPicker}
      />
    </Box>
  );
};

const ScheduleBody = ({
  schedule,
  updateSchedule,
  scheduleOptions,
  timezone,
  verb,
  textBeforeSendTime,
  minutesOnHourPicker,
}: Omit<ScheduleProps, "onScheduleChange"> & {
  updateSchedule: UpdateSchedule;
}) => {
  const itemProps = {
    schedule,
    updateSchedule,
  };

  const Frequency = (
    <ScheduleTypeSelect
      key="frequency"
      {...itemProps}
      scheduleType={schedule.schedule_type}
      scheduleOptions={scheduleOptions}
    />
  );
  const Hour = (
    <SelectTime
      key="hour"
      schedule={schedule}
      updateSchedule={updateSchedule}
    />
  );

  const TimeDetails = () => {
    // eslint-disable-next-line react/prop-types
    schedule.schedule_hour ??= null;
    // eslint-disable-next-line react/prop-types
    if (schedule.schedule_hour === null) {
      return null;
    }
    if (!timezone) {
      return null;
    }
    return (
      <DisplayTimeDetails
        key="time-details"
        // eslint-disable-next-line react/prop-types
        hour={schedule.schedule_hour}
        // eslint-disable-next-line react/prop-types
        amPm={schedule.schedule_hour >= 12 ? 1 : 0}
        timezone={timezone}
        textBeforeSendTime={textBeforeSendTime}
      />
    );
  };

  const scheduleType = schedule.schedule_type;

  if (scheduleType === "hourly") {
    if (minutesOnHourPicker) {
      const Minute = <SelectMinute {...itemProps} />;
      // e.g. "Send hourly at 15 minutes past the hour"
      return (
        <>{c(
          "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a number of minutes",
        ).jt`${verb} ${Frequency} at ${Minute} minutes past the hour`}</>
      );
    } else {
      // e.g. "Send hourly"
      return (
        <>{c("{0} is a verb like 'Send', {1} is an adverb like 'hourly'")
          .jt`${verb} ${Frequency}`}</>
      );
    }
  } else if (scheduleType === "daily") {
    // e.g. "Send daily at 12:00pm"
    return (
      <>{c(
        "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a time like '12:00pm'",
      ).jt`${verb} ${Frequency} at ${Hour}`}</>
    );
  } else if (scheduleType === "weekly") {
    const Weekday = <SelectWeekday key="weekday" {...itemProps} />;
    // e.g. "Send weekly on Tuesday at 12:00pm"
    return (
      <>
        {c(
          "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a day like 'Tuesday', {3} is a time like '12:00pm'",
        ).jt`${verb} ${Frequency} on ${Weekday} at ${Hour}`}
        <TimeDetails />
      </>
    );
  } else if (scheduleType === "monthly") {
    const Frame = <SelectFrame key="frame" {...itemProps} />;
    // e.g. "Send monthly on the 15th at 12:00pm"
    if (schedule.schedule_frame === "mid") {
      return (
        <>
          {c(
            "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is the noun '15th' (as in 'the 15th of the month'), {3} is a time like '12:00pm'",
          ).jt`${verb} ${Frequency} on the ${Frame} at ${Hour}`}
          <TimeDetails />
        </>
      );
    } else {
      const WeekdayOfMonth = (
        <SelectWeekdayOfMonth key="weekday-of-month" {...itemProps} />
      );
      // e.g. "Send monthly on the first Tuesday at 12:00pm"
      return (
        <>
          {c(
            "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is an adjective like 'first', {3} is a day like 'Tuesday', {4} is a time like '12:00pm'",
          )
            .jt`${verb} ${Frequency} on the ${Frame} ${WeekdayOfMonth} at ${Hour}`}
        </>
      );
    }
  } else {
    return null;
  }
};

const ScheduleTypeSelect = ({
  scheduleType,
  updateSchedule,
  scheduleOptions,
}: {
  scheduleType?: ScheduleType | null;
  updateSchedule: UpdateSchedule;
  scheduleOptions: ScheduleType[];
}) => {
  const scheduleTypeOptions = scheduleOptions.map(option => ({
    label: getOptionName(option),
    value: option,
  }));

  return (
    <AutoWidthSelect
      display="flex"
      value={scheduleType}
      onChange={(value: ScheduleType) => updateSchedule("schedule_type", value)}
      data={scheduleTypeOptions}
    />
  );
};
