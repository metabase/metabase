import cx from "classnames";
import { type HTMLAttributes, useCallback, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { c } from "ttag";

import { CronExpressionInput } from "metabase/common/components/CronExpressioInput";
import { Box, Flex, type FlexProps } from "metabase/ui";
import { formatCronExpressionForUI } from "metabase/utils/cron";

import {
  GROUP_ATTRIBUTES,
  GroupControlsTogether,
} from "./GroupControlsTogether";
import S from "./Schedule.module.css";
import {
  SelectFrame,
  SelectFrequency,
  SelectMinute,
  SelectTime,
  SelectWeekday,
  SelectWeekdayOfMonth,
} from "./components";
import { scheduleValueToCron, toScheduleBuilderValue } from "./cron";
import {
  type GetScheduleDefaults,
  type NormalizedScheduleValue,
  type ScheduleValue,
  type ScheduleValueType,
  changeScheduleType,
  getScheduleDefaults,
  isScheduleComplete,
  isScheduleCronValue,
  normalizeScheduleValue,
  setScheduleField,
} from "./domain";
import { byTheMinuteIntervals } from "./strings";
import type { ScheduleChangeEvent, UpdateSchedule } from "./types";

export interface ScheduleProps {
  className?: string;
  value: ScheduleValue;
  scheduleOptions: ScheduleValueType[];
  onScheduleChange: (event: ScheduleChangeEvent) => void;
  timezone?: string;
  verb?: string;
  minutesOnHourPicker?: boolean;
  getDefaults?: GetScheduleDefaults;
  labelAlignment?: "compact" | "left";
  layout?: "vertical" | "horizontal";
  fullWidthSelects?: boolean;
  renderScheduleDescription?: (
    value: NormalizedScheduleValue,
    cronInputValue: string,
  ) => JSX.Element | string | null;
}

export const Schedule = ({
  className,
  value,
  scheduleOptions,
  timezone,
  verb,
  minutesOnHourPicker,
  getDefaults = getScheduleDefaults,
  onScheduleChange,
  labelAlignment = "compact",
  layout = "vertical",
  fullWidthSelects = false,
  renderScheduleDescription,
  ...flexProps
}: ScheduleProps & FlexProps & HTMLAttributes<HTMLDivElement>) => {
  const normalizedValue = useMemo(
    () => normalizeScheduleValue(value, getDefaults),
    [value, getDefaults],
  );
  const [cronInputValue, setCronInputValue] = useState(() =>
    formatCronExpressionForUI(scheduleValueToCron(normalizedValue)),
  );

  const emitChange = useCallback(
    (nextValue: NormalizedScheduleValue) => {
      onScheduleChange({
        value: nextValue,
        cronString: isScheduleComplete(nextValue)
          ? scheduleValueToCron(nextValue)
          : null,
      });
    },
    [onScheduleChange],
  );

  const updateScheduleType = useCallback(
    (scheduleType: ScheduleValueType) => {
      if (scheduleType === "cron") {
        const cron = scheduleValueToCron(normalizedValue);
        setCronInputValue(formatCronExpressionForUI(cron));
        emitChange({ schedule_type: "cron", cron });
        return;
      }

      emitChange(
        changeScheduleType(
          toScheduleBuilderValue(normalizedValue),
          scheduleType,
          getDefaults,
        ),
      );
    },
    [emitChange, getDefaults, normalizedValue],
  );

  const renderedSchedule = useMemo(() => {
    const selectFrequency = (
      <SelectFrequency
        key="frequency"
        scheduleType={normalizedValue.schedule_type}
        onScheduleTypeChange={updateScheduleType}
        scheduleOptions={scheduleOptions}
      />
    );

    if (isScheduleCronValue(normalizedValue)) {
      const selectCron = (
        <CronExpressionInput
          data-group={GROUP_ATTRIBUTES.separate}
          key="cron"
          value={cronInputValue}
          onChange={setCronInputValue}
          onBlurChange={(cron) => emitChange({ schedule_type: "cron", cron })}
        />
      );
      return [verb, selectFrequency, selectCron];
    }

    const { schedule_frame, schedule_day, schedule_hour, schedule_minute } =
      normalizedValue;
    const updateSchedule: UpdateSchedule = (field, value) =>
      emitChange(setScheduleField(normalizedValue, field, value));

    const selectMinute = (
      <SelectMinute
        key="minute"
        schedule_minute={schedule_minute}
        updateSchedule={updateSchedule}
      />
    );

    const selectEveryMinute = (
      <SelectMinute
        key="minute"
        schedule_minute={schedule_minute}
        updateSchedule={updateSchedule}
        range={byTheMinuteIntervals}
      />
    );

    const selectTime = (
      <SelectTime
        key="time"
        schedule_hour={schedule_hour}
        updateSchedule={updateSchedule}
        timezone={timezone}
      />
    );

    const selectWeekday = (
      <SelectWeekday
        key="weekday"
        schedule_day={schedule_day}
        updateSchedule={updateSchedule}
      />
    );

    const selectFrame = (
      <SelectFrame
        key="frame"
        schedule_frame={schedule_frame}
        updateSchedule={updateSchedule}
      />
    );

    const selectWeekdayOfMonth = (
      <SelectWeekdayOfMonth
        key="wom"
        schedule_day={schedule_day}
        updateSchedule={updateSchedule}
      />
    );

    return match(normalizedValue.schedule_type)
      .with("every_n_minutes", () => {
        // "Minute" is registered as a plural msgid elsewhere; give this row's
        // singular its own context so it's a distinct key (no extraction clash).
        const minuteUnit = (
          schedule_minute === 1
            ? c("Time unit in the schedule builder, e.g. 'every 1 minute'")
                .t`Minute`
            : c(
                "Plural time unit in the schedule builder, e.g. 'every 10 minutes'",
              ).t`Minutes`
        ).toLocaleLowerCase();
        return c(
          "{0} is a verb like 'Check', {1} is an adverb like 'by the minute', {2} is a number of minutes.",
        )
          .jt`${verb} ${selectFrequency} every ${selectEveryMinute} ${minuteUnit}`;
      })
      .with("hourly", () => {
        return minutesOnHourPicker
          ? // For example, "Send hourly at 15 minutes past the hour"
            c(
              "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a number of minutes",
            )
              .jt`${verb} ${selectFrequency} at ${selectMinute} minutes past the hour`
          : // For example, "Send hourly"
            [verb, selectFrequency];
      })
      .with(
        "daily",
        () =>
          // For example, "Send daily at 12:00pm"
          c(
            "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a time like '12:00pm'",
          ).jt`${verb} ${selectFrequency} at ${selectTime}`,
      )
      .with(
        "weekly",
        () =>
          // For example, "Send weekly on Tuesday at 12:00pm"
          c(
            "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a day like 'Tuesday', {3} is a time like '12:00pm'",
          ).jt`${verb} ${selectFrequency} on ${selectWeekday} at ${selectTime}`,
      )
      .with("monthly", () =>
        schedule_frame === "mid"
          ? // For example, "Send monthly on the 15th at 12:00pm"
            c(
              "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is the noun '15th' (as in 'the 15th of the month'), {3} is a time like '12:00pm'",
            )
              .jt`${verb} ${selectFrequency} on the ${selectFrame} at ${selectTime}`
          : // For example, "Send monthly on the first Tuesday at 12:00pm"
            c(
              "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is an adjective like 'first', {3} is a day like 'Tuesday', {4} is a time like '12:00pm'",
            ).jt`${verb} ${selectFrequency} on the ${selectFrame} ${
              selectWeekdayOfMonth
            } at ${selectTime}`,
      )
      .exhaustive();
  }, [
    minutesOnHourPicker,
    normalizedValue,
    scheduleOptions,
    timezone,
    updateScheduleType,
    verb,
    cronInputValue,
    emitChange,
  ]);

  const scheduleDescription = useMemo(() => {
    return renderScheduleDescription?.(normalizedValue, cronInputValue) || null;
  }, [renderScheduleDescription, normalizedValue, cronInputValue]);

  return (
    <Flex direction="column" gap="1rem" {...flexProps}>
      <Box
        className={cx(
          S.Schedule,
          {
            [S.CompactLabels]: labelAlignment === "compact",
            [S.Horizontal]: layout === "horizontal",
            [S.FullWidthSelects]: fullWidthSelects,
          },
          className,
        )}
      >
        <GroupControlsTogether>{renderedSchedule}</GroupControlsTogether>
      </Box>
      {scheduleDescription && (
        <Box style={{ gridColumn: "span 2" }}>{scheduleDescription}</Box>
      )}
    </Flex>
  );
};
