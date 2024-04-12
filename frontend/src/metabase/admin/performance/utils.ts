import { weekdays } from "metabase/components/Schedule/constants";
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
  const minute = settings.schedule_minute?.toString() ?? "*";
  const hour = settings.schedule_hour?.toString() ?? "*";
  let dayOfWeek = settings.schedule_day
    ? dayToCron(settings.schedule_day).toString()
    : "?";
  const month = "*";
  let dayOfMonth = settings.schedule_day ? "?" : "*";
  if (settings.schedule_type === "monthly" && settings.schedule_frame) {
    if (settings.schedule_day) {
      const cronifiedFrame = frameToCron(settings.schedule_frame).replace(
        /^1$/,
        "#1",
      );
      const cronifiedDay = dayToCron(settings.schedule_day);
      dayOfWeek = `${cronifiedDay}${cronifiedFrame}`;
    } else {
      dayOfMonth = frameToCron(settings.schedule_frame);
    }
  }
  return `0 ${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
};

// A return value of null means we couldn't convert the cron to a ScheduleSettings object
export const cronToScheduleSettings = (
  cron: string | null | undefined,
): ScheduleSettings | null => {
  if (!cron) {
    return defaultSchedule;
  }

  // Simplify
  const allQuestionMarks = /\?/g;
  const ALL = "*";
  cron = cron.replace(allQuestionMarks, ALL);

  const [_second, minute, hour, dayOfMonth, month, weekday] = cron.split(" ");

  if (month !== ALL) {
    return null;
  }
  let schedule_type: ScheduleType | undefined;
  if (dayOfMonth === ALL) {
    if (weekday === ALL) {
      schedule_type = hour === ALL ? "hourly" : "daily";
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
    if (weekday === ALL) {
      schedule_frame = frameFromCron[dayOfMonth];
    } else {
      // Split on transition from number to non-number
      const weekdayParts = weekday.split(/(?<=\d)(?=\D)/);
      const day = parseInt(weekdayParts[0]);
      schedule_day = weekdays[day - 1]?.value as ScheduleDayType;
      if (dayOfMonth === ALL) {
        const frameInCronFormat = weekdayParts[1].replace(/^#/, "");
        schedule_frame = frameFromCron[frameInCronFormat];
      } else {
        schedule_frame = frameFromCron[dayOfMonth];
      }
    }
  } else {
    if (weekday !== ALL) {
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
