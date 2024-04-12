import { Cron, weekdays } from "metabase/components/Schedule/constants";
import type {
  ScheduleDayType,
  ScheduleFrameType,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

const dayToCron = (day: ScheduleSettings["schedule_day"]) => {
  const index = weekdays.findIndex(o => o.value === day);
  if (index === -1) {
    throw new Error(`Invalid day: ${day}`);
  }
  return index + 1;
};

const frameToCron = (frame: ScheduleFrameType) =>
  ({ first: "1", last: "L", mid: "15" }[frame]);

const frameFromCron: Record<string, ScheduleFrameType> = {
  "15": "mid",
  "1": "first",
  L: "last",
};

export const scheduleSettingsToCron = (settings: ScheduleSettings): string => {
  const minute = settings.schedule_minute?.toString() ?? Cron.AllValues;
  const hour = settings.schedule_hour?.toString() ?? Cron.AllValues;
  let dayOfWeek = settings.schedule_day
    ? dayToCron(settings.schedule_day).toString()
    : Cron.NoSpecificValue;
  const month = Cron.AllValues;
  let dayOfMonth: string = settings.schedule_day
    ? Cron.NoSpecificValue
    : Cron.AllValues;
  if (settings.schedule_type === "monthly" && settings.schedule_frame) {
    if (settings.schedule_day) {
      const frameInCronFormat = frameToCron(settings.schedule_frame).replace(
        /^1$/,
        "#1",
      );
      const dayInCronFormat = dayToCron(settings.schedule_day);
      dayOfWeek = `${dayInCronFormat}${frameInCronFormat}`;
    } else {
      dayOfMonth = frameToCron(settings.schedule_frame);
    }
  }
  const second = "0";
  const cronExpression = [
    second,
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek,
  ].join(" ");
  return cronExpression;
};

// A return value of null means we couldn't convert the cron to a ScheduleSettings object
export const cronToScheduleSettings = (
  cron: string | null | undefined,
): ScheduleSettings | null => {
  if (!cron) {
    return defaultSchedule;
  }

  // The Quartz cron library used in the backend distinguishes between 'no specific value' and 'all values',
  // but for simplicity we can treat them as the same here
  cron = cron.replace(new RegExp(Cron.NoSpecificValue, "g"), Cron.AllValues);

  const [_second, minute, hour, dayOfMonth, month, weekday] = cron.split(" ");

  if (month !== Cron.AllValues) {
    return null;
  }
  let schedule_type: ScheduleType | undefined;
  if (dayOfMonth === Cron.AllValues) {
    if (weekday === Cron.AllValues) {
      schedule_type = hour === Cron.AllValues ? "hourly" : "daily";
    } else {
      // If the weekday part of the cron expression means 'first Monday',
      // 'second Tuesday', etc., or 'last Monday', 'last Tuesday', etc.,
      // then the frequency is monthly
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
      schedule_frame = frameFromCron[dayOfMonth];
    } else {
      // Split on transition from number to non-number
      const weekdayParts = weekday.split(/(?<=\d)(?=\D)/);
      const day = parseInt(weekdayParts[0]);
      schedule_day = weekdays[day - 1]?.value as ScheduleDayType;
      if (dayOfMonth === Cron.AllValues) {
        const frameInCronFormat = weekdayParts[1].replace(/^#/, "");
        schedule_frame = frameFromCron[frameInCronFormat];
      } else {
        schedule_frame = frameFromCron[dayOfMonth];
      }
    }
  } else {
    if (weekday !== Cron.AllValues) {
      schedule_day = weekdays[parseInt(weekday) - 1]?.value as ScheduleDayType;
    }
  }
  return {
    schedule_type,
    schedule_minute: parseInt(minute),
    schedule_hour: parseInt(hour),
    schedule_day,
    schedule_frame,
  };
};

const defaultSchedule: ScheduleSettings = {
  schedule_type: "hourly",
  schedule_minute: 0,
};

export const hourToTwelveHourFormat = (hour: number) => hour % 12 || 12;
