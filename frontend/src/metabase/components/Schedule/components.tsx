import { useMemo } from "react";
import { t } from "ttag";

import { hourToTwelveHourFormat } from "metabase/admin/performance/utils";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import type { SelectProps } from "metabase/ui";
import { Group, SegmentedControl, Select, Text } from "metabase/ui";
import type {
  ScheduleDayType,
  ScheduleFrameType,
  ScheduleSettings,
} from "metabase-types/api";

import {
  addZeroesToHour,
  amAndPM,
  defaultHour,
  frames,
  hours,
  minutes,
  weekdays,
} from "./constants";
import type { UpdateSchedule } from "./types";

export const SelectFrame = ({
  schedule,
  updateSchedule,
}: {
  schedule: ScheduleSettings;
  updateSchedule: UpdateSchedule;
}) => {
  return (
    <AutoWidthSelect
      value={schedule.schedule_frame}
      onChange={(value: ScheduleFrameType) =>
        updateSchedule("schedule_frame", value)
      }
      data={frames}
    />
  );
};

export const SelectTime = ({
  schedule,
  updateSchedule,
}: {
  schedule: ScheduleSettings;
  updateSchedule: UpdateSchedule;
}) => {
  const hourIn24HourFormat =
    schedule.schedule_hour && !isNaN(schedule.schedule_hour)
      ? schedule.schedule_hour
      : defaultHour;
  const hour = hourToTwelveHourFormat(hourIn24HourFormat);
  const amPm = hourIn24HourFormat >= 12 ? 1 : 0;
  return (
    <Group spacing="xs">
      <AutoWidthSelect
        value={hour.toString()}
        data={hours}
        onChange={(value: string) =>
          updateSchedule("schedule_hour", Number(value) + amPm * 12)
        }
      />
      <SegmentedControl
        radius="sm"
        value={amPm.toString()}
        onChange={value =>
          updateSchedule("schedule_hour", hour + Number(value) * 12)
        }
        data={amAndPM}
      />
    </Group>
  );
};

export const TimeDetails = ({
  hour,
  amPm,
  timezone,
  textBeforeSendTime,
}: {
  hour: number | null;
  amPm: number | null;
  timezone: string | null;
  textBeforeSendTime?: string;
}) => {
  const applicationName = useSelector(getApplicationName);
  if (hour === null || amPm === null || !timezone) {
    return null;
  }
  const time = addZeroesToHour(hourToTwelveHourFormat(hour));
  const amOrPM = amAndPM[amPm].label;
  return (
    <Text w="100%" mt="xs" size="sm" fw="bold" color="text-light">
      {textBeforeSendTime} {time} {amOrPM} {timezone},{" "}
      {t`your ${applicationName} timezone`}
    </Text>
  );
};

export const SelectWeekday = ({
  schedule,
  updateSchedule,
}: {
  schedule: ScheduleSettings;
  updateSchedule: UpdateSchedule;
}) => {
  return (
    <AutoWidthSelect
      value={schedule.schedule_day}
      onChange={(value: ScheduleDayType) =>
        updateSchedule("schedule_day", value)
      }
      data={weekdays}
    />
  );
};

/** Selects the weekday of the month, e.g. the first Monday of the month
  "First" is selected via SelectFrame. This component provides the weekday */
export const SelectWeekdayOfMonth = ({
  schedule,
  updateSchedule,
}: {
  schedule: ScheduleSettings;
  updateSchedule: UpdateSchedule;
}) => (
  <AutoWidthSelect
    value={schedule.schedule_day || "calendar-day"}
    onChange={(value: ScheduleDayType | "calendar-day") =>
      updateSchedule("schedule_day", value === "calendar-day" ? null : value)
    }
    data={[{ label: t`calendar day`, value: "calendar-day" }, ...weekdays]}
  />
);

export const SelectMinute = ({
  schedule,
  updateSchedule,
}: {
  schedule: ScheduleSettings;
  updateSchedule: UpdateSchedule;
}) => {
  const minuteOfHour = isNaN(schedule.schedule_minute as number)
    ? 0
    : schedule.schedule_minute;
  return (
    <AutoWidthSelect
      value={(minuteOfHour || 0).toString()}
      data={minutes}
      onChange={(value: string) =>
        updateSchedule("schedule_minute", Number(value))
      }
    />
  );
};

export const AutoWidthSelect = (props: SelectProps) => {
  const longestLabel = useMemo(
    () =>
      props.data.reduce((acc, option) => {
        const label = typeof option === "string" ? option : option.label || "";
        return label.length > acc.length ? label : acc;
      }, ""),
    [props.data],
  );
  const maxWidth =
    longestLabel.length > 10 ? "unset" : `${longestLabel.length + 0.75}rem`;
  return (
    <Select
      miw="5rem"
      maw={maxWidth}
      styles={{
        wrapper: {
          paddingRight: 0,
          marginTop: 0,
          "&:not(:only-child)": { marginTop: "0" },
        },
        input: { paddingRight: 0 },
      }}
      {...props}
    />
  );
};
