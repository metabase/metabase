import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  hourTo24HourFormat,
  hourToTwelveHourFormat,
} from "metabase/admin/performance/utils";
import { measureTextWidth } from "metabase/lib/measure-text";
import { useSelector } from "metabase/lib/redux";
import { has24HourModeSetting } from "metabase/lib/time";
import { getApplicationName } from "metabase/selectors/whitelabel";
import type { SelectProps } from "metabase/ui";
import { Box, Group, SegmentedControl, Select, Tooltip } from "metabase/ui";
import type {
  ScheduleDayType,
  ScheduleFrameType,
  ScheduleSettings,
} from "metabase-types/api";

import {
  type Weekday,
  defaultHour,
  getHours,
  getScheduleStrings,
  minutes,
} from "./constants";
import type { UpdateSchedule } from "./types";
import { getLongestSelectLabel } from "./utils";

export type SelectFrameProps = {
  schedule: ScheduleSettings;
  updateSchedule: UpdateSchedule;
  frames?: { label: string; value: ScheduleFrameType }[];
};

export const SelectFrame = ({
  schedule,
  updateSchedule,
  frames = getScheduleStrings().frames,
}: SelectFrameProps) => {
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
  timezone,
}: {
  schedule: ScheduleSettings;
  updateSchedule: UpdateSchedule;
  timezone?: string | null;
}) => {
  const { amAndPM } = getScheduleStrings();
  const applicationName = useSelector(getApplicationName);
  const isClock12Hour = !has24HourModeSetting();
  const hourIn24HourFormat =
    schedule.schedule_hour !== undefined &&
    schedule.schedule_hour !== null &&
    !isNaN(schedule.schedule_hour)
      ? schedule.schedule_hour
      : defaultHour;
  const hour = isClock12Hour
    ? hourToTwelveHourFormat(hourIn24HourFormat)
    : hourIn24HourFormat;
  const amPm = hourIn24HourFormat >= 12 ? 1 : 0;
  const hourIndex = isClock12Hour && hour === 12 ? 0 : hour;
  const value = hourIndex === 0 && isClock12Hour ? "12" : hourIndex.toString();
  return (
    <Group spacing={isClock12Hour ? "xs" : "sm"} style={{ rowGap: ".5rem" }}>
      {/* Select the hour */}
      <AutoWidthSelect
        value={value}
        data={getHours()}
        onChange={(value: string) => {
          const num = Number(value);
          updateSchedule(
            "schedule_hour",
            isClock12Hour ? hourTo24HourFormat(num, amPm) : num,
          );
        }}
      />
      {/* Choose between AM and PM */}
      <Group spacing="sm">
        {isClock12Hour && (
          <SegmentedControl
            radius="sm"
            value={amPm.toString()}
            onChange={value =>
              updateSchedule(
                "schedule_hour",
                hourTo24HourFormat(hour, parseInt(value)),
              )
            }
            data={amAndPM}
          />
        )}
        {timezone && (
          <Tooltip label={t`Your ${applicationName} timezone`}>
            <Box tabIndex={0}>{timezone}</Box>
          </Tooltip>
        )}
      </Group>
    </Group>
  );
};

export type SelectWeekdayProps = {
  schedule: ScheduleSettings;
  updateSchedule: UpdateSchedule;
};

export const SelectWeekday = ({
  schedule,
  updateSchedule,
}: SelectWeekdayProps) => {
  const { weekdays } = getScheduleStrings();
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

export type SelectWeekdayOfMonthProps = {
  schedule: ScheduleSettings;
  updateSchedule: UpdateSchedule;
  weekdayOfMonthOptions?: (
    | Weekday
    | { label: string; value: "calendar-day" }
  )[];
};

/** Selects the weekday of the month, e.g. the first Monday of the month
  "First" is selected via SelectFrame. This component provides the weekday */
export const SelectWeekdayOfMonth = ({
  schedule,
  updateSchedule,
  weekdayOfMonthOptions = getScheduleStrings().weekdayOfMonthOptions,
}: SelectWeekdayOfMonthProps) => {
  return (
    <AutoWidthSelect
      value={schedule.schedule_day || "calendar-day"}
      onChange={(value: ScheduleDayType | "calendar-day") =>
        updateSchedule("schedule_day", value === "calendar-day" ? null : value)
      }
      data={weekdayOfMonthOptions}
    />
  );
};

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
  const maxWidth = useMemo(() => {
    const longestLabel = getLongestSelectLabel(props.data);
    const maxWidth = `${measureTextWidth(longestLabel) + 60}px`;
    return maxWidth;
  }, [props.data]);
  return (
    <Select
      miw="5rem"
      w={maxWidth}
      styles={{
        wrapper: {
          paddingInlineEnd: 0,
          marginTop: 0,
        },
        label: {
          marginBottom: 0,
        },
        input: { paddingInlineEnd: 0, lineHeight: "2.5rem" },
      }}
      {...props}
    />
  );
};
