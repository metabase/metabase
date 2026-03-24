import { memoize } from "underscore";

import type {
  ScheduleDayType,
  ScheduleFrameType,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

import { Cron, getScheduleStrings } from "./strings";

const AM = 0;
const PM = 1;

const everyToCronSyntax = (every: number | string) =>
  `${Cron.EveryPrefix}${every}`;
export const isRepeatingEvery = (every: string) =>
  every.startsWith(Cron.EveryPrefix);
export const cronUnitToNumber = (unit: string) =>
  parseInt(unit.replace(Cron.EveryPrefix, ""));

const dayToCron = (day: ScheduleSettings["schedule_day"]) => {
  const { weekdays } = getScheduleStrings();
  const index = weekdays.findIndex((o) => o.value === day);
  if (index === -1) {
    throw new Error(`Invalid day: ${day}`);
  }
  return index + 1;
};

const frameToCronMap = { first: "1", last: "L", mid: "15" };
const frameToCron = (frame: ScheduleFrameType) => frameToCronMap[frame];

const frameFromCronMap: Record<string, ScheduleFrameType> = {
  "15": "mid",
  "1": "first",
  L: "last",
};
const frameFromCron = (frameInCronFormat: string) =>
  frameFromCronMap[frameInCronFormat];

export const scheduleSettingsToCron = (settings: ScheduleSettings): string => {
  const second = "0";
  const year = "*";
  let minute = settings.schedule_minute?.toString() ?? Cron.AllValues;
  const hour = settings.schedule_hour?.toString() ?? Cron.AllValues;
  let weekday = settings.schedule_day
    ? dayToCron(settings.schedule_day).toString()
    : Cron.NoSpecificValue;
  const month = Cron.AllValues;
  let dayOfMonth: string = settings.schedule_day
    ? Cron.NoSpecificValue
    : Cron.AllValues;
  if (settings.schedule_type === "every_n_minutes") {
    minute = everyToCronSyntax(minute);
  } else if (settings.schedule_type === "monthly" && settings.schedule_frame) {
    // There are two kinds of monthly schedule:
    // - weekday-based (e.g. "on the first Monday of the month")
    // - date-based (e.g. "on the 15th of the month")
    if (settings.schedule_day) {
      // Handle weekday-based monthly schedule
      const frameInCronFormat = frameToCron(settings.schedule_frame).replace(
        /^1$/,
        "#1",
      );
      const dayInCronFormat = dayToCron(settings.schedule_day);
      weekday = `${dayInCronFormat}${frameInCronFormat}`;
    } else {
      // Handle date-based monthly schedule
      dayOfMonth = frameToCron(settings.schedule_frame);
    }
  }
  const cronExpression = [
    second,
    minute,
    hour,
    dayOfMonth,
    month,
    weekday,
    year,
  ].join(" ");
  return cronExpression;
};

const defaultSchedule: ScheduleSettings = {
  schedule_type: "hourly",
  schedule_minute: 0,
};
export const defaultCron = scheduleSettingsToCron(defaultSchedule);

/** Returns null if we can't convert the cron expression to a ScheduleSettings object */
export const cronToScheduleSettings_unmemoized = (
  cron: string | null | undefined,
  isCustomSchedule: boolean = false,
): ScheduleSettings | null => {
  if (!cron) {
    return defaultSchedule;
  }

  const { weekdays } = getScheduleStrings();

  // The Quartz cron library used in the backend distinguishes between 'no specific value' and 'all values',
  // but for simplicity we can treat them as the same here
  cron = cron.replace(
    new RegExp(Cron.NoSpecificValue_Escaped, "g"),
    Cron.AllValues,
  );

  const [_second, minute, hour, dayOfMonth, month, weekday] = cron.split(" ");

  if (month !== Cron.AllValues && !isCustomSchedule) {
    return null;
  }
  let schedule_type: ScheduleType | undefined;
  if (isCustomSchedule) {
    schedule_type = "cron";
  } else if (dayOfMonth === Cron.AllValues) {
    if (weekday === Cron.AllValues) {
      if (hour === Cron.AllValues) {
        schedule_type = isRepeatingEvery(minute) ? "every_n_minutes" : "hourly";
      } else {
        schedule_type = "daily";
      }
    } else {
      // If the weekday part of the cron expression is something like '1#1' (first Monday),
      // or '2L' (last Tuesday), then the frequency is monthly
      const oneWeekPerMonth = weekday.match(/[#L]/);
      schedule_type = oneWeekPerMonth ? "monthly" : "weekly";
    }
  } else {
    schedule_type = "monthly";
  }
  let schedule_frame: ScheduleFrameType | undefined;
  let schedule_day: ScheduleDayType | undefined;
  if (schedule_type === "monthly") {
    if (weekday === Cron.AllValues) {
      schedule_frame = frameFromCron(dayOfMonth);
    } else {
      const dayStr = weekday.match(/^\d+/)?.[0];
      if (!dayStr) {
        throw new Error(
          `The cron expression contains an invalid weekday: ${weekday}`,
        );
      }
      const day = parseInt(dayStr);
      schedule_day = weekdays[day - 1]?.value as ScheduleDayType;
      if (dayOfMonth === Cron.AllValues) {
        // Match the part after the '#' in a string like '6#1' or the letter in '6L'
        const frameInCronFormat = weekday
          .match(/^\d+(\D.*)$/)?.[1]
          .replace(/^#/, "");
        if (!frameInCronFormat) {
          throw new Error(
            `The cron expression contains an invalid weekday: ${weekday}`,
          );
        }
        schedule_frame = frameFromCron(frameInCronFormat);
      } else {
        schedule_frame = frameFromCron(dayOfMonth);
      }
    }
  } else {
    if (weekday !== Cron.AllValues) {
      schedule_day = weekdays[parseInt(weekday) - 1]?.value as ScheduleDayType;
    }
  }

  const scheduleMinute =
    minute === Cron.AllValues ? null : cronUnitToNumber(minute);
  const scheduleHour = hour === Cron.AllValues ? null : cronUnitToNumber(hour);
  return {
    schedule_type,
    schedule_minute: scheduleMinute,
    schedule_hour: scheduleHour,
    schedule_day,
    schedule_frame,
  };
};
export const cronToScheduleSettings = memoize(
  cronToScheduleSettings_unmemoized,
  (cron, isCustomSchedule) => `${cron}_${isCustomSchedule}`,
);

const isValidAmPm = (amPm: number) => amPm === AM || amPm === PM;

export const hourToTwelveHourFormat = (hour: number) => hour % 12 || 12;

export const hourTo24HourFormat = (hour: number, amPm: number): number => {
  if (!isValidAmPm(amPm)) {
    amPm = AM;
  }
  const hour24 = amPm === PM ? (hour % 12) + 12 : hour % 12;
  return hour24 === 24 ? 0 : hour24;
};
