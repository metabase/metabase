import { c } from "ttag";
import { pick } from "underscore";

import { capitalize } from "metabase/lib/formatting/strings";
import { Box } from "metabase/ui";
import type { ScheduleSettings, ScheduleType } from "metabase-types/api";

import {
  AutoWidthSelect,
  DayPicker,
  HourPicker,
  MinutePicker,
  MonthlyPicker,
} from "./components";
import { defaultDay, optionNameTranslations } from "./constants";
import type { HandleChangeProperty, ScheduleChangeProp } from "./types";

const getOptionName = (option: ScheduleType) =>
  optionNameTranslations[option] || capitalize(option);

export interface ScheduleProps {
  schedule: ScheduleSettings;
  scheduleOptions: ScheduleType[];
  timezone?: string;
  textBeforeInterval?: string;
  textBeforeSendTime?: string;
  minutesOnHourPicker?: boolean;
  onScheduleChange: (
    nextSchedule: ScheduleSettings,
    change: ScheduleChangeProp,
  ) => void;
}

export const Schedule = ({
  schedule,
  scheduleOptions,
  timezone,
  textBeforeInterval: verb,
  textBeforeSendTime,
  minutesOnHourPicker,
  onScheduleChange,
}: {
  schedule: ScheduleSettings;
  scheduleOptions: ScheduleType[];
  timezone?: string;
  textBeforeInterval?: string;
  textBeforeSendTime?: string;
  minutesOnHourPicker?: boolean;
  onScheduleChange: (
    nextSchedule: ScheduleSettings,
    change: ScheduleChangeProp,
  ) => void;
}) => {
  const handleChangeProperty: HandleChangeProperty = (name, value) => {
    let newSchedule: ScheduleSettings = {
      ...schedule,
      [name]: value,
    };

    // TODO: Not sure these nulls are needed
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

    newSchedule = pick(newSchedule, val => val !== undefined);

    if (name === "schedule_type") {
      newSchedule = {
        ...defaults[value as ScheduleType],
        ...newSchedule,
      };
    } else if (name === "schedule_frame") {
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

    onScheduleChange(newSchedule, { name, value });
  };

  return (
    <Box lh="41px" display="flex" style={{ flexWrap: "wrap", gap: ".5rem" }}>
      <ScheduleBody
        schedule={schedule}
        handleChangeProperty={handleChangeProperty}
        scheduleOptions={scheduleOptions}
        timezone={timezone}
        textBeforeInterval={verb}
        textBeforeSendTime={textBeforeSendTime}
        minutesOnHourPicker={minutesOnHourPicker}
      />
    </Box>
  );
};

const ScheduleBody = ({
  schedule,
  handleChangeProperty,
  scheduleOptions,
  timezone,
  textBeforeInterval: verb,
  textBeforeSendTime,
  minutesOnHourPicker,
}: Omit<ScheduleProps, "onScheduleChange"> & {
  handleChangeProperty: HandleChangeProperty;
}) => {
  const itemProps = {
    schedule,
    handleChangeProperty,
  };

  const scheduleTypeSelectProps = {
    ...itemProps,
    scheduleType: schedule.schedule_type,
    scheduleOptions,
  };

  const HowOften = () => (
    <ScheduleTypeSelect key="how-often" {...scheduleTypeSelectProps} />
  );
  const Day = () => <DayPicker {...itemProps} />;
  const Hour = () => (
    <HourPicker
      schedule={schedule}
      timezone={timezone || "UTC"}
      textBeforeSendTime={textBeforeSendTime}
      handleChangeProperty={handleChangeProperty}
    />
  );
  const Minute = () => (
    <MinutePicker
      schedule={schedule}
      handleChangeProperty={handleChangeProperty}
    />
  );
  const Month = () => (
    <MonthlyPicker
      schedule={schedule}
      handleChangeProperty={handleChangeProperty}
    />
  );

  const scheduleType = schedule.schedule_type;

  switch (scheduleType) {
    case "hourly":
      if (minutesOnHourPicker) {
        return (
          <>{
            // prettier-ignore
            c("{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a number of minutes").
            jt`${verb} ${(<HowOften />)} at ${(<Minute />)} minutes past the hour`
          }</>
        );
      } else {
        return (
          <>{
            // prettier-ignore
            c("{0} is a verb like 'Send', {1} is an adverb like 'hourly'").
            jt`${verb} ${(<HowOften />)}`
          }</>
        );
      }
    case "daily":
      return (
        <>{
          // prettier-ignore
          c("{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a time like '12:00pm'").
        jt`${verb} ${(<HowOften />)} at ${(<Hour />)}`
        }</>
      );
    case "weekly":
      return (
        <>{c(
          "{0} is a verb like 'Send', {1} is an adverb like 'hourly' or 'weekly', {2} is a day like 'Tuesday', {3} is a time like '12:00pm'",
        ).jt`${verb} ${(<HowOften />)} on ${(<Day />)} at ${(<Hour />)}`}</>
      );
    case "monthly":
      return (
        <>{c(
          "{0} is a verb like 'Send', {1} is an adverb like 'hourly' or 'weekly', {2} is a day like 'Tuesday', {3} is a time like '12:00pm'",
        ).jt`${verb} ${(<HowOften />)} on the ${(<Month />)} at ${(
          <Hour />
        )}`}</>
      );
    default:
      return <></>;
  }
};

const ScheduleTypeSelect = ({
  scheduleType,
  handleChangeProperty,
  scheduleOptions,
}: {
  scheduleType?: ScheduleType | null;
  handleChangeProperty: HandleChangeProperty;
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
      onChange={(value: ScheduleType) =>
        handleChangeProperty("schedule_type", value)
      }
      data={scheduleTypeOptions}
    />
  );
};
