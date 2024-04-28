import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";

import { SegmentedControl } from "metabase/components/SegmentedControl";
import type { SelectChangeEvent } from "metabase/core/components/Select";
import Select from "metabase/core/components/Select";
import CS from "metabase/css/core/index.css";
import {
  AM_PM_OPTIONS,
  getDayOfWeekOptions,
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  MONTH_DAY_OPTIONS,
} from "metabase/lib/date-time";
import { capitalize } from "metabase/lib/formatting/strings";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import type {
  ScheduleDayType,
  ScheduleFrameType,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

import {
  PickerRoot,
  PickerRow,
  PickerSpacedRow,
  PickerText,
  ScheduleDescriptionContainer,
} from "./SchedulePicker.styled";

const optionNameTranslations = {
  hourly: t`Hourly`,
  daily: t`Daily`,
  weekly: t`Weekly`,
  monthly: t`Monthly`,
};

type ScheduleProperty = keyof ScheduleSettings;
type ScheduleChangeProp = { name: ScheduleProperty; value: unknown };

export interface SchedulePickerProps {
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

class SchedulePicker extends Component<SchedulePickerProps> {
  handleChangeProperty(
    name: ScheduleProperty,
    value: ScheduleSettings[typeof name],
  ) {
    let newSchedule: ScheduleSettings = {
      ...this.props.schedule,
      [name]: value,
    };

    if (name === "schedule_type") {
      // clear out other values than schedule_type for hourly schedule
      if (value === "hourly") {
        newSchedule = {
          ...newSchedule,
          schedule_day: null,
          schedule_frame: null,
          schedule_hour: null,
          schedule_minute: 0,
        };
      }

      // default to midnight for all schedules other than hourly
      if (value !== "hourly") {
        newSchedule = {
          ...newSchedule,
          schedule_hour: newSchedule.schedule_hour || 0,
        };
      }

      // clear out other values than schedule_type and schedule_day for daily schedule
      if (value === "daily") {
        newSchedule = {
          ...newSchedule,
          schedule_day: null,
          schedule_frame: null,
        };
      }

      // default to Monday when user wants a weekly schedule + clear out schedule_frame
      if (value === "weekly") {
        newSchedule = {
          ...newSchedule,
          schedule_day: DEFAULT_DAY,
          schedule_frame: null,
        };
      }

      // default to First, Monday when user wants a monthly schedule
      if (value === "monthly") {
        newSchedule = {
          ...newSchedule,
          schedule_frame: "first",
          schedule_day: DEFAULT_DAY,
        };
      }
    } else if (name === "schedule_frame") {
      // when the monthly schedule frame is the 15th, clear out the schedule_day
      if (value === "mid") {
        newSchedule = { ...newSchedule, schedule_day: null };
      } else {
        // first or last, needs a day of the week
        newSchedule = {
          ...newSchedule,
          schedule_day: newSchedule.schedule_day || DEFAULT_DAY,
        };
      }
    }

    this.props.onScheduleChange(newSchedule, { name, value });
  }

  renderMonthlyPicker() {
    const { schedule } = this.props;

    const DAY_OPTIONS = [
      { name: t`Calendar Day`, value: null },
      ...getDayOfWeekOptions(),
    ];

    return (
      <PickerSpacedRow>
        <PickerText>{t`on the`}</PickerText>
        <Select
          value={schedule.schedule_frame}
          onChange={(e: SelectChangeEvent<ScheduleFrameType>) =>
            this.handleChangeProperty("schedule_frame", e.target.value)
          }
          options={MONTH_DAY_OPTIONS}
        />
        {schedule.schedule_frame !== "mid" && (
          <span className={CS.mx1}>
            <Select
              value={schedule.schedule_day}
              onChange={(e: SelectChangeEvent<ScheduleDayType>) =>
                this.handleChangeProperty("schedule_day", e.target.value)
              }
              options={DAY_OPTIONS}
            />
          </span>
        )}
      </PickerSpacedRow>
    );
  }

  renderDayPicker() {
    const { schedule } = this.props;

    return (
      <PickerRow>
        <span className={cx(CS.textBold, CS.mx1)}>{t`on`}</span>
        <Select
          value={schedule.schedule_day}
          onChange={(e: SelectChangeEvent<ScheduleDayType>) =>
            this.handleChangeProperty("schedule_day", e.target.value)
          }
          options={getDayOfWeekOptions()}
        />
      </PickerRow>
    );
  }

  renderMinutePicker() {
    const { schedule } = this.props;
    const minuteOfHour = isNaN(schedule.schedule_minute as number)
      ? 0
      : schedule.schedule_minute;
    return (
      <PickerSpacedRow>
        <PickerText>{t`at`}</PickerText>
        <Select
          className={CS.mr1}
          value={minuteOfHour}
          options={MINUTE_OPTIONS}
          onChange={(e: SelectChangeEvent<number>) =>
            this.handleChangeProperty("schedule_minute", e.target.value)
          }
        />
        <span className={CS.textBold}>{t`minutes past the hour`}</span>
      </PickerSpacedRow>
    );
  }

  renderHourPicker() {
    const { schedule, timezone, textBeforeSendTime } = this.props;

    const hourOfDay = isNaN(schedule.schedule_hour as number)
      ? 8
      : schedule.schedule_hour || 0;

    const hour = hourOfDay % 12;
    const amPm = hourOfDay >= 12 ? 1 : 0;

    return (
      <>
        <PickerSpacedRow>
          <PickerText>{t`at`}</PickerText>
          <Select
            className={CS.mr1}
            value={hour}
            options={HOUR_OPTIONS}
            onChange={(e: SelectChangeEvent<number>) =>
              this.handleChangeProperty(
                "schedule_hour",
                e.target.value + amPm * 12,
              )
            }
          />
          <SegmentedControl
            value={amPm}
            onChange={value =>
              this.handleChangeProperty("schedule_hour", hour + value * 12)
            }
            options={AM_PM_OPTIONS}
            fullWidth
          />
        </PickerSpacedRow>
        {textBeforeSendTime && (
          <ScheduleDescriptionContainer>
            {textBeforeSendTime} {hour === 0 ? 12 : hour}:00{" "}
            {amPm ? "PM" : "AM"} {timezone}, <MetabaseTimeZone />.
          </ScheduleDescriptionContainer>
        )}
      </>
    );
  }

  render() {
    const { schedule, scheduleOptions, textBeforeInterval } = this.props;

    const scheduleType = schedule.schedule_type;

    return (
      <PickerRoot>
        <PickerRow>
          <PickerText>{textBeforeInterval}</PickerText>
          <Select
            value={scheduleType}
            onChange={(e: SelectChangeEvent<ScheduleType>) =>
              this.handleChangeProperty("schedule_type", e.target.value)
            }
            options={scheduleOptions}
            optionNameFn={(o: ScheduleType) =>
              optionNameTranslations[o] || capitalize(o)
            }
            optionValueFn={(o: ScheduleType) => o}
          />
          {scheduleType === "weekly" && this.renderDayPicker()}
        </PickerRow>
        {scheduleType === "hourly" &&
          this.props.minutesOnHourPicker &&
          this.renderMinutePicker()}
        {scheduleType === "monthly" && this.renderMonthlyPicker()}
        {(scheduleType === "daily" ||
          scheduleType === "weekly" ||
          scheduleType === "monthly") &&
          this.renderHourPicker()}
      </PickerRoot>
    );
  }
}

function MetabaseTimeZone() {
  const applicationName = useSelector(getApplicationName);
  return <>{t`your ${applicationName} timezone`}</>;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SchedulePicker;
