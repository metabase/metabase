import { useMemo } from "react";
import { t } from "ttag";

import {
  hourTo24HourFormat,
  hourToTwelveHourFormat,
} from "metabase/admin/performance/utils";
import { capitalize } from "metabase/lib/formatting/strings";
import { useSelector } from "metabase/lib/redux";
import { has24HourModeSetting } from "metabase/lib/time";
import { getSetting } from "metabase/selectors/settings";
import { getApplicationName } from "metabase/selectors/whitelabel";
import type { SelectProps } from "metabase/ui";
import { Box, Group, SegmentedControl, Select, Tooltip } from "metabase/ui";
import type { FontStyle } from "metabase/visualizations/shared/types/measure-text";
import type {
  ScheduleDayType,
  ScheduleFrameType,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

import {
  type Weekday,
  defaultHour,
  getHours,
  getScheduleStrings,
  minutes,
  getScheduleComponentLabel,
} from "./constants";
import type { UpdateSchedule } from "./types";
import { getLongestSelectLabel, measureTextWidthSafely } from "./utils";

export type SelectFrameProps = {
  schedule: ScheduleSettings;
  updateSchedule: UpdateSchedule;
  frames?: { label: string; value: ScheduleFrameType }[];
};

/** A Select that changes the schedule frequency (e.g., daily, hourly, monthly, etc.),
 * also known as the schedule 'type'. */
export const SelectFrequency = ({
  scheduleType,
  updateSchedule,
  scheduleOptions,
}: {
  scheduleType?: ScheduleType | null;
  updateSchedule: UpdateSchedule;
  scheduleOptions: ScheduleType[];
}) => {
  const { scheduleOptionNames } = getScheduleStrings();

  const scheduleTypeOptions = useMemo(
    () =>
      scheduleOptions.map(option => ({
        label: scheduleOptionNames[option] || capitalize(option),
        value: option,
      })),
    [scheduleOptions, scheduleOptionNames],
  );

  const label = useMemo(() => getScheduleComponentLabel("frequency"), []);
  return (
    <AutoWidthSelect
      display="flex"
      value={scheduleType}
      onChange={(value: ScheduleType) => updateSchedule("schedule_type", value)}
      data={scheduleTypeOptions}
      aria-label={label}
    />
  );
};

export const SelectFrame = ({
  schedule,
  updateSchedule,
  frames = getScheduleStrings().frames,
}: SelectFrameProps) => {
  const label = useMemo(() => getScheduleComponentLabel("frame"), []);
  return (
    <AutoWidthSelect
      value={schedule.schedule_frame}
      onChange={(value: ScheduleFrameType) =>
        updateSchedule("schedule_frame", value)
      }
      data={frames}
      aria-label={label}
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
  const timeSelectLabel = useMemo(() => getScheduleComponentLabel("time"), []);
  const amPmControlLabel = useMemo(() => getScheduleComponentLabel("amPm"), []);
  const applicationName = useSelector(getApplicationName);
  const timezoneTooltipText = t`Your ${applicationName} timezone`;
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
        aria-label={timeSelectLabel}
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
            aria-label={amPmControlLabel}
          />
        )}
        {timezone && (
          <Tooltip label={timezoneTooltipText}>
            <Box
              aria-label={timezoneTooltipText}
              tabIndex={0} // Ensure tooltip can be triggered by the keyboard
            >
              {timezone}
            </Box>
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
  const label = useMemo(() => getScheduleComponentLabel("weekday"), []);
  return (
    <AutoWidthSelect
      value={schedule.schedule_day}
      onChange={(value: ScheduleDayType) =>
        updateSchedule("schedule_day", value)
      }
      data={weekdays}
      aria-label={label}
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

/** Selects the weekday of the month, such as the first Monday of the month or the last Tuesday of the month.
  (The SelectFrame component offers a choice between 'first', '15th' and 'last'.
  This component offers a choice of weekday.) */
export const SelectWeekdayOfMonth = ({
  schedule,
  updateSchedule,
  weekdayOfMonthOptions = getScheduleStrings().weekdayOfMonthOptions,
}: SelectWeekdayOfMonthProps) => {
  const label = useMemo(() => getScheduleComponentLabel("weekdayOfMonth"), []);
  return (
    <AutoWidthSelect
      value={schedule.schedule_day || "calendar-day"}
      onChange={(value: ScheduleDayType | "calendar-day") =>
        updateSchedule("schedule_day", value === "calendar-day" ? null : value)
      }
      data={weekdayOfMonthOptions}
      aria-label={label}
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
  const label = useMemo(() => getScheduleComponentLabel("minute"), []);
  return (
    <AutoWidthSelect
      value={(minuteOfHour || 0).toString()}
      data={minutes}
      onChange={(value: string) =>
        updateSchedule("schedule_minute", Number(value))
      }
      aria-label={label}
    />
  );
};

export const AutoWidthSelect = ({
  style,
  ...props
}: { style?: Partial<FontStyle> } & SelectProps) => {
  const fontFamily = useSelector(state =>
    getSetting(state, "application-font"),
  );
  const maxWidth = useMemo(() => {
    const longestLabel = getLongestSelectLabel(props.data);
    const maxWidth = `${
      measureTextWidthSafely(longestLabel, 50, {
        family: fontFamily,
        ...style,
      }) + 60
    }px`;
    return maxWidth;
  }, [props.data, style, fontFamily]);
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
