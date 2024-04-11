import { c, t } from "ttag";
import { pick, times } from "underscore";

import { capitalize } from "metabase/lib/formatting/strings";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import type { SelectProps } from "metabase/ui";
import { Box, Group, SegmentedControl, Select } from "metabase/ui";
import type {
  ScheduleDayType,
  ScheduleFrameType,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";
import { useEffect, useRef } from "react";

type HandleChangeProperty = (
  name: ScheduleProperty,
  value: ScheduleSettings[typeof name],
) => void;

const minutes = times(60, n => ({
  label: n.toString(),
  value: n.toString(),
}));

const hours = times(12, n => ({
  label: c("This is a time like 12:00pm. {0} is the hour part of the time").t`${
    n === 0 ? 12 : n
  }:00`,
  value: `${n}`,
}));

const optionNameTranslations = {
  // The context is needed because 'hourly' can be an adjective ('hourly rate') or adverb ('update hourly'). Same with 'daily', 'weekly', and 'monthly'.
  hourly: c("adverb").t`hourly`,
  daily: c("adverb").t`daily`,
  //weekly: c("adverb").t`weekly`,
  weekly: c("adverb").t`weekly`,
  monthly: c("adverb").t`monthly`,
};

export type DayOfWeek = {
  label: string;
  value: ScheduleDayType;
};

const daysOfTheWeek: DayOfWeek[] = [
  { label: t`Sunday`, value: "sun" },
  { label: t`Monday`, value: "mon" },
  { label: t`Tuesday`, value: "tue" },
  { label: t`Wednesday`, value: "wed" },
  { label: t`Thursday`, value: "thu" },
  { label: t`Friday`, value: "fri" },
  { label: t`Saturday`, value: "sat" },
];

const amAndPM = [
  { label: c("As in 9:00 AM").t`AM`, value: "0" },
  { label: c("As in 9:00 PM").t`PM`, value: "1" },
];

const frames = [
  { label: t`first`, value: "first" },
  { label: t`last`, value: "last" },
  { label: t`15th (midpoint)`, value: "mid" },
];

const getOptionName = (option: ScheduleType) =>
  optionNameTranslations[option] || capitalize(option);

type ScheduleProperty = keyof ScheduleSettings;
type ScheduleChangeProp = { name: ScheduleProperty; value: unknown };

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

const DEFAULT_DAY = "mon";

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
        schedule_day: DEFAULT_DAY,
        schedule_frame: null,
      },
      monthly: {
        schedule_frame: "first",
        schedule_day: DEFAULT_DAY,
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
          schedule_day: newSchedule.schedule_day || DEFAULT_DAY,
          ...newSchedule,
        };
      }
    }

    onScheduleChange(newSchedule, { name, value });
  };

  return (
    <Box
      ref={ref}
      lh="41px"
      display="flex"
      style={{ flexWrap: "wrap", gap: ".5rem" }}
    >
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
    <AutoSizedSelect
      display="flex"
      value={scheduleType}
      onChange={(value: ScheduleType) =>
        handleChangeProperty("schedule_type", value)
      }
      data={scheduleTypeOptions}
    />
  );
};

const MetabaseTimeZone = () => {
  const applicationName = useSelector(getApplicationName);
  return <>{t`your ${applicationName} timezone`}</>;
};

export const MonthlyPicker = ({
  schedule,
  handleChangeProperty,
}: {
  schedule: ScheduleSettings;
  handleChangeProperty: HandleChangeProperty;
}) => {
  const DAY_OPTIONS = [
    { label: t`calendar day`, value: "calendar-day" },
    ...daysOfTheWeek,
  ];

  return (
    <>
      <AutoSizedSelect
        value={schedule.schedule_frame}
        onChange={(value: ScheduleFrameType) =>
          handleChangeProperty("schedule_frame", value)
        }
        data={frames}
      />
      {schedule.schedule_frame !== "mid" && (
        <AutoSizedSelect
          value={schedule.schedule_day || "calendar-day"}
          onChange={(value: ScheduleDayType | "calendar-day") =>
            handleChangeProperty(
              "schedule_day",
              value === "calendar-day" ? null : value,
            )
          }
          data={DAY_OPTIONS}
        />
      )}
    </>
  );
};

export const HourPicker = ({
  schedule,
  timezone,
  textBeforeSendTime,
  handleChangeProperty,
}: {
  schedule: ScheduleSettings;
  timezone: string;
  textBeforeSendTime?: string;
  handleChangeProperty: HandleChangeProperty;
}) => {
  const hourOfDay = isNaN(schedule.schedule_hour as number)
    ? 8
    : schedule.schedule_hour || 0;

  const hour = hourOfDay % 12;
  const amPm = hourOfDay >= 12 ? 1 : 0;

  return (
    <>
      <Group spacing="xs" style={{ lineHeight: "1rem" }}>
        <AutoSizedSelect
          value={hour.toString()}
          data={hours}
          onChange={(value: string) =>
            handleChangeProperty("schedule_hour", Number(value) + amPm * 12)
          }
        />
        <SegmentedControl
          radius="sm"
          value={amPm.toString()}
          onChange={value =>
            handleChangeProperty("schedule_hour", hour + Number(value) * 12)
          }
          data={amAndPM}
          fullWidth
        />
        {textBeforeSendTime && (
          <Box mt="1rem" color="text-medium">
            {textBeforeSendTime} {hour === 0 ? 12 : hour}:00{" "}
            {amPm ? "PM" : "AM"} {timezone}, <MetabaseTimeZone />.
          </Box>
        )}
      </Group>
    </>
  );
};

export const DayPicker = ({
  schedule,
  handleChangeProperty,
}: {
  schedule: ScheduleSettings;
  handleChangeProperty: HandleChangeProperty;
}) => {
  return (
    <AutoSizedSelect
      value={schedule.schedule_day}
      onChange={(value: ScheduleDayType) =>
        handleChangeProperty("schedule_day", value)
      }
      data={daysOfTheWeek}
    />
  );
};

export const MinutePicker = ({
  schedule,
  handleChangeProperty,
}: {
  schedule: ScheduleSettings;
  handleChangeProperty: HandleChangeProperty;
}) => {
  const minuteOfHour = isNaN(schedule.schedule_minute as number)
    ? 0
    : schedule.schedule_minute;
  return (
    <AutoSizedSelect
      value={(minuteOfHour || 0).toString()}
      data={minutes}
      onChange={(value: string) =>
        handleChangeProperty("schedule_minute", Number(value))
      }
    />
  );
};

const AutoSizedSelect = (props: SelectProps) => {
  const longestLabel = props.data.reduce((acc, option) => {
    const label = typeof option === "string" ? option : option.label || "";
    return label.length > acc.length ? label : acc;
  }, "");
  const maxWidth =
    longestLabel.length > 10 ? "unset" : `${longestLabel.length + 0.75}rem`;
  return (
    <Select
      miw="5rem"
      maw={maxWidth}
      styles={{
        wrapper: { paddingRight: 0, marginTop: 0 },
        input: { paddingRight: 0 },
      }}
      {...props}
    />
  );
};
