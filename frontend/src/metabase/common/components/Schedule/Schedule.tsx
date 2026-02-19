import cx from "classnames";
import { type HTMLAttributes, useCallback, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { c, msgid, ngettext } from "ttag";
import _ from "underscore";

import {
  cronToScheduleSettings,
  scheduleSettingsToCron,
} from "metabase/admin/performance/utils";
import { CronExpressionInput } from "metabase/common/components/CronExpressioInput";
import { formatCronExpressionForUI } from "metabase/lib/cron";
import { removeNullAndUndefinedValues } from "metabase/lib/types";
import { Box, Flex, type FlexProps } from "metabase/ui";
import type { ScheduleSettings, ScheduleType } from "metabase-types/api";

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
import { byTheMinuteIntervals } from "./strings";
import type { UpdateSchedule } from "./types";
import { getScheduleDefaults } from "./utils";

export interface ScheduleProps {
  className?: string;
  cronString: string;
  scheduleOptions: ScheduleType[];
  onScheduleChange: (
    nextCronString: string,
    nextSchedule: ScheduleSettings,
  ) => void;
  timezone?: string;
  verb?: string;
  minutesOnHourPicker?: boolean;
  labelAlignment?: "compact" | "left";
  layout?: "vertical" | "horizontal";
  isCustomSchedule?: boolean;
  renderScheduleDescription?: (
    schedule: ScheduleSettings,
    cronString: string,
  ) => JSX.Element | string | null;
}

export const Schedule = ({
  className,
  cronString: initialCronString,
  scheduleOptions,
  timezone,
  verb,
  minutesOnHourPicker,
  onScheduleChange,
  labelAlignment = "compact",
  layout = "vertical",
  isCustomSchedule,
  renderScheduleDescription,
  ...flexProps
}: ScheduleProps & FlexProps & HTMLAttributes<HTMLDivElement>) => {
  const [internalCronString, setInternalCronString] = useState(() =>
    formatCronExpressionForUI(initialCronString),
  );
  const schedule = useMemo(() => {
    return (
      cronToScheduleSettings(initialCronString, isCustomSchedule) ?? {
        schedule_type: "hourly" as ScheduleType,
        schedule_minute: 0,
      }
    );
  }, [initialCronString, isCustomSchedule]);

  const updateSchedule: UpdateSchedule = useCallback(
    (
      updatedField: keyof ScheduleSettings,
      newValue: ScheduleSettings[typeof updatedField],
    ) => {
      let newSchedule: ScheduleSettings = {
        ...schedule,
        [updatedField]: newValue,
      };
      const defaults = getScheduleDefaults(newSchedule);

      if (updatedField === "schedule_type") {
        // When a new schedule type is selected, use the default values for that type
        newSchedule = {
          schedule_type: newValue as ScheduleType,
          ...defaults,
        };
        if (newValue === "cron") {
          setInternalCronString(formatCronExpressionForUI(initialCronString));
        }
      } else {
        newSchedule = _.defaults(
          removeNullAndUndefinedValues(newSchedule),
          defaults,
        );
      }

      // when the monthly schedule frame is the 15th, clear out the schedule_day
      if (newSchedule.schedule_frame === "mid") {
        newSchedule.schedule_day = null;
      }

      const newCronString = scheduleSettingsToCron(newSchedule);
      onScheduleChange(newCronString, newSchedule);
    },
    [initialCronString, onScheduleChange, schedule],
  );

  const renderedSchedule = useMemo(() => {
    // Merge default values into the schedule
    const scheduleWithDefaults: ScheduleSettings = _.defaults(
      schedule,
      getScheduleDefaults(schedule),
    );

    const {
      schedule_type,
      schedule_frame,
      schedule_day,
      schedule_hour,
      schedule_minute,
    } = scheduleWithDefaults;

    const selectFrequency = (
      <SelectFrequency
        key="frequency"
        updateSchedule={updateSchedule}
        scheduleType={schedule_type}
        scheduleOptions={scheduleOptions}
      />
    );

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

    const selectCron = (
      <CronExpressionInput
        data-group={GROUP_ATTRIBUTES.separate}
        key="cron"
        value={internalCronString}
        onChange={(value: string) => {
          setInternalCronString(value);
        }}
        onBlurChange={(value) =>
          onScheduleChange(value, {
            schedule_type: "cron",
          })
        }
      />
    );

    return match(schedule_type)
      .with(
        "every_n_minutes",
        () =>
          // Converting to lowercase here, because 'minute` is used without pluralization on the backend,
          // and it's impossible to have both pluralized and single form for the same string.
          c(
            "{0} is a verb like 'Check', {1} is an adverb like 'by the minute', {2} is a number of minutes.",
          )
            .jt`${verb} ${selectFrequency} every ${selectEveryMinute} ${ngettext(msgid`Minute`, "Minutes", schedule_minute as number).toLocaleLowerCase()}`,
      )
      .with("hourly", () => {
        return minutesOnHourPicker ? (
          // For example, "Send hourly at 15 minutes past the hour"
          c(
            "{0} is a verb like 'Send', {1} is an adverb like 'hourly', {2} is a number of minutes",
          )
            .jt`${verb} ${selectFrequency} at ${selectMinute} minutes past the hour`
        ) : (
          // For example, "Send hourly"
          // NOTE: babel-ttag-plugin prevents us from localizing this JSX because it consists only of placeholders
          <>
            {verb} {selectFrequency}
          </>
        );
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
      .with("cron", () => [verb, selectFrequency, selectCron])
      .with(null, () => null)
      .with(undefined, () => null)
      .exhaustive();
  }, [
    minutesOnHourPicker,
    schedule,
    scheduleOptions,
    timezone,
    updateSchedule,
    verb,
    internalCronString,
    onScheduleChange,
  ]);

  const scheduleDescription = useMemo(() => {
    return renderScheduleDescription?.(schedule, internalCronString) || null;
  }, [renderScheduleDescription, schedule, internalCronString]);

  return (
    <Flex direction="column" gap="1rem" {...flexProps}>
      <Box
        className={cx(
          S.Schedule,
          {
            [S.CompactLabels]: labelAlignment === "compact",
            [S.Horizontal]: layout === "horizontal",
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
