import { useMemo } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import type { SelectProps } from "metabase/ui";
import { Box, Select, Group, SegmentedControl } from "metabase/ui";
import type {
  ScheduleSettings,
  ScheduleDayType,
  ScheduleFrameType,
} from "metabase-types/api";

import { daysOfTheWeek, amAndPM, frames, hours, minutes } from "./constants";
import type { HandleChangeProperty } from "./types";

const dayOptions = [
  { label: t`calendar day`, value: "calendar-day" },
  ...daysOfTheWeek,
];

export const MonthlyPicker = ({
  schedule,
  handleChangeProperty,
}: {
  schedule: ScheduleSettings;
  handleChangeProperty: HandleChangeProperty;
}) => {
  // TODO: Separate these two pickers since they can appear in different order depending on the localization
  return (
    <>
      <AutoWidthSelect
        value={schedule.schedule_frame}
        onChange={(value: ScheduleFrameType) =>
          handleChangeProperty("schedule_frame", value)
        }
        data={frames}
      />
      {schedule.schedule_frame !== "mid" && (
        <AutoWidthSelect
          value={schedule.schedule_day || "calendar-day"}
          onChange={(value: ScheduleDayType | "calendar-day") =>
            handleChangeProperty(
              "schedule_day",
              value === "calendar-day" ? null : value,
            )
          }
          data={dayOptions}
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
        <AutoWidthSelect
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
    <AutoWidthSelect
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
    <AutoWidthSelect
      value={(minuteOfHour || 0).toString()}
      data={minutes}
      onChange={(value: string) =>
        handleChangeProperty("schedule_minute", Number(value))
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
        wrapper: { paddingRight: 0, marginTop: 0 },
        input: { paddingRight: 0 },
      }}
      {...props}
    />
  );
};

const MetabaseTimeZone = () => {
  const applicationName = useSelector(getApplicationName);
  return <>{t`your ${applicationName} timezone`}</>;
};
