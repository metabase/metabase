import { useMemo } from "react";
import { t } from "ttag";

import {
  hourTo24HourFormat,
  hourToTwelveHourFormat,
} from "metabase/admin/performance/utils";
import { capitalize } from "metabase/lib/formatting/strings";
import { useSelector } from "metabase/lib/redux";
import { has24HourModeSetting } from "metabase/lib/time";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Box, Group, SegmentedControl, Tooltip } from "metabase/ui";
import type {
  ScheduleDayType,
  ScheduleFrameType,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

import { AutoWidthSelect } from "./AutoWidthSelect";
import {
  type Weekday,
  defaultHour,
  getHours,
  getScheduleComponentLabel,
  getScheduleStrings,
  minutes,
} from "./strings";
import type { UpdateSchedule } from "./types";

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
      value={scheduleType ?? "daily"}
      onChange={(value: ScheduleType | null) =>
        updateSchedule("schedule_type", value)
      }
      data={scheduleTypeOptions}
      aria-label={label}
      data-testid="select-frequency"
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
      value={schedule.schedule_frame ?? "first"}
      onChange={(value: ScheduleFrameType) =>
        updateSchedule("schedule_frame", value)
      }
      data={frames}
      aria-label={label}
      data-testid="select-frame"
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
    <Group gap={isClock12Hour ? "xs" : "sm"} style={{ rowGap: ".5rem" }}>
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
        data-testid="select-time"
      />
      {/* Choose between AM and PM */}
      <Group gap="sm">
        {isClock12Hour && (
          <SegmentedControl
            lh="1rem"
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
            data-testid="select-am-pm"
          />
        )}
        {timezone && (
          <Tooltip label={timezoneTooltipText}>
            <Box
              role="note"
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
    <AutoWidthSelect<ScheduleDayType>
      value={schedule.schedule_day ?? "sun"}
      onChange={(value: ScheduleDayType) =>
        updateSchedule("schedule_day", value)
      }
      data={weekdays}
      aria-label={label}
      data-testid="select-weekday"
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
      data-testid="select-weekday-of-month"
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
      data-testid="select-minute"
    />
  );
};
