import { useMemo } from "react";
import { t } from "ttag";

import {
  hourTo24HourFormat,
  hourToTwelveHourFormat,
} from "metabase/admin/performance/utils";
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
  amAndPM,
  defaultHour,
  frames,
  getHours,
  minutes,
  weekdayOfMonthOptions,
  weekdays,
} from "./constants";
import type { UpdateSchedule } from "./types";
import { getLongestSelectLabel } from "./utils";

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
  timezone,
}: {
  schedule: ScheduleSettings;
  updateSchedule: UpdateSchedule;
  timezone?: string | null;
}) => {
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
  return (
    <Group spacing={isClock12Hour ? "xs" : "sm"} style={{ rowGap: ".5rem" }}>
      <AutoWidthSelect
        value={hourIndex.toString()}
        data={getHours()}
        onChange={(value: string) => {
          const num = Number(value);
          updateSchedule(
            "schedule_hour",
            isClock12Hour ? hourTo24HourFormat(num, amPm) : num,
          );
        }}
      />
      <Group spacing="sm">
        {isClock12Hour && (
          <SegmentedControl
            radius="sm"
            value={amPm.toString()}
            onChange={value =>
              updateSchedule("schedule_hour", hour + Number(value) * 12)
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
    data={weekdayOfMonthOptions}
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
    () => getLongestSelectLabel(props.data),
    [props.data],
  );
  const maxWidth =
    longestLabel.length > 15 ? "unset" : `${longestLabel.length + 0.85}rem`;
  return (
    <Select
      miw="5rem"
      maw={maxWidth}
      styles={{
        wrapper: {
          paddingRight: 0,
          marginTop: 0,
        },
        label: {
          marginBottom: 0,
        },
        input: { paddingRight: 0 },
      }}
      {...props}
    />
  );
};
