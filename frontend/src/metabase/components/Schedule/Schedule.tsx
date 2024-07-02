import { useCallback } from "react";
import { c } from "ttag";

import { capitalize } from "metabase/lib/formatting/strings";
import { removeNullAndUndefinedValues } from "metabase/lib/types";
import { Box } from "metabase/ui";
import type { ScheduleSettings, ScheduleType } from "metabase-types/api";

import {
  AutoWidthSelect,
  SelectFrame,
  SelectMinute,
  SelectTime,
  SelectWeekday,
  SelectWeekdayOfMonth,
} from "./components";
import {
  defaultDay,
  defaultHour,
  frames,
  optionNameTranslations,
  weekdayOfMonthOptions,
} from "./constants";
import type { ScheduleChangeProp, UpdateSchedule } from "./types";
import { addScheduleComponents, getLongestSelectLabel } from "./utils";

type ScheduleProperty = keyof ScheduleSettings;

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
    schedule_hour: defaultHour,
    schedule_minute: 0,
  },
  weekly: {
    schedule_day: defaultDay,
    schedule_frame: null,
    schedule_minute: 0,
  },
  monthly: {
    schedule_frame: "first",
    schedule_day: defaultDay,
    schedule_minute: 0,
  },
};

export const Schedule = ({
  schedule,
  scheduleOptions,
  timezone,
  verb,
  minutesOnHourPicker,
  onScheduleChange,
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
}) => {
  const updateSchedule: UpdateSchedule = useCallback(
    (field: ScheduleProperty, value: ScheduleSettings[typeof field]) => {
      let newSchedule: ScheduleSettings = {
        ...schedule,
        [field]: value,
      };

      newSchedule = removeNullAndUndefinedValues(newSchedule);

      if (field === "schedule_type") {
        newSchedule = {
          ...newSchedule,
          ...defaults[value as ScheduleType],
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
    <Box
      lh="40px"
      display="grid"
      style={{
        gridTemplateColumns: "fit-content(100%) auto",
        gap: ".5rem",
      }}
    >
      {renderSchedule({
        schedule,
        updateSchedule,
        scheduleOptions,
        timezone,
        verb,
        minutesOnHourPicker,
      })}
    </Box>
  );
};

const renderSchedule = ({
  schedule,
  updateSchedule,
  scheduleOptions,
  timezone,
  verb,
  minutesOnHourPicker,
}: Omit<ScheduleProps, "onScheduleChange"> & {
  updateSchedule: UpdateSchedule;
}) => {
  const itemProps = {
    schedule,
    updateSchedule,
  };
  const frequencyProps = {
    ...itemProps,
    scheduleType: schedule.schedule_type,
    scheduleOptions,
  };
  const timeProps = {
    ...itemProps,
    timezone,
  };
  const minuteProps = itemProps;
  const weekdayProps = itemProps;
  const frameProps = {
    ...itemProps,
    longestLabel: getLongestSelectLabel(frames),
  };
  const weekdayOfMonthProps = {
    ...itemProps,
    longestLabel: getLongestSelectLabel(weekdayOfMonthOptions),
  };

  const scheduleType = schedule.schedule_type;
  if (scheduleType === "hourly") {
    if (minutesOnHourPicker) {
      // e.g. "Send hourly at 15 minutes past the hour"
      return addScheduleComponents(
        c(
          "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a number of minutes",
        ).t`{0} {1} at {2} minutes past the hour`,
        [
          verb,
          <SelectFrequency key="frequency" {...frequencyProps} />,
          <SelectMinute key="minute" {...minuteProps} />,
        ],
      );
    } else {
      // e.g. "Send hourly"
      return addScheduleComponents(
        // We cannot use "{0} {1}" as an argument to the t function, since only has placeholders.
        // So, as a workaround, we include square brackets in the string, and then remove them.
        c("{0} is a verb like 'Send', {1} is an adverb like 'hourly'.")
          .t`[{0} {1}]`
          .replace(/^\[/, "")
          .replace(/\]$/, ""),
        [verb, <SelectFrequency key="frequency" {...frequencyProps} />],
      );
    }
  } else if (scheduleType === "daily") {
    // e.g. "Send daily at 12:00pm"
    return addScheduleComponents(
      c(
        "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a time like '12:00pm'",
      ).t`{0} {1} at {2}`,
      [
        verb,
        <SelectFrequency key="frequency" {...frequencyProps} />,
        <SelectTime key="time" {...timeProps} />,
      ],
    );
  } else if (scheduleType === "weekly") {
    // e.g. "Send weekly on Tuesday at 12:00pm"
    return addScheduleComponents(
      c(
        "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a day like 'Tuesday', {3} is a time like '12:00pm'",
      ).t`{0} {1} on {2} at {3}`,
      [
        verb,
        <SelectFrequency key="frequency" {...frequencyProps} />,
        <SelectWeekday key="weekday" {...weekdayProps} />,
        <SelectTime key="time" {...timeProps} />,
      ],
    );
  } else if (scheduleType === "monthly") {
    // e.g. "Send monthly on the 15th at 12:00pm"
    if (schedule.schedule_frame === "mid") {
      return addScheduleComponents(
        c(
          "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is the noun '15th' (as in 'the 15th of the month'), {3} is a time like '12:00pm'",
        ).t`{0} {1} on the {2} at {3}`,
        [
          verb,
          <SelectFrequency key="frequency" {...frequencyProps} />,
          <SelectFrame key="frame" {...frameProps} />,
          <SelectTime key="time" {...timeProps} />,
        ],
      );
    } else {
      // e.g. "Send monthly on the first Tuesday at 12:00pm"
      return addScheduleComponents(
        c(
          "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is an adjective like 'first', {3} is a day like 'Tuesday', {4} is a time like '12:00pm'",
        ).t`{0} {1} on the {2} {3} at {4}`,
        [
          verb,
          <SelectFrequency key="frequency" {...frequencyProps} />,
          <SelectFrame key="frame" {...frameProps} />,
          <SelectWeekdayOfMonth
            key="weekday-of-month"
            {...weekdayOfMonthProps}
          />,
          <SelectTime key="time" {...timeProps} />,
        ],
      );
    }
  } else {
    return null;
  }
};

/** A Select that changes the schedule frequency (e.g., daily, hourly, monthly, etc.),
 * also known as the schedule 'type'. */
const SelectFrequency = ({
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
