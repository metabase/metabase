import { DAY_OF_WEEK_OPTIONS } from "metabase/lib/date-time";
import type {
  ScheduleDayType,
  ScheduleFrameType,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

const dayToCron = (day: ScheduleSettings["schedule_day"]) => {
  const index = DAY_OF_WEEK_OPTIONS.findIndex(o => o.value === day);
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
  cron = cron.replace("?", "*");

  const [_second, minute, hour, dayOfMonth, month, dayOfWeek] = cron.split(" ");

  if (month !== "*") {
    return null;
  }
  let schedule_type: ScheduleType | undefined;
  if (dayOfMonth === "*") {
    if (dayOfWeek === "*") {
      if (hour === "*") {
        schedule_type = "hourly";
      } else {
        schedule_type = "daily";
      }
    } else {
      if (dayOfWeek.match(/[#L]/)) {
        schedule_type = "monthly";
      } else {
        schedule_type = "weekly";
      }
    }
  } else {
    schedule_type = "monthly";
  }
  let schedule_frame: ScheduleFrameType | undefined;
  let schedule_day: ScheduleDayType | undefined;
  if (schedule_type === "monthly") {
    if (dayOfWeek === "*") {
      schedule_frame = frameFromCron[dayOfMonth];
    } else {
      // Split on transition from number to non-number
      const dayOfWeekParts = dayOfWeek.split(/(?<=\d)(?=\D)/);
      const day = parseInt(dayOfWeekParts[0]);
      schedule_day = DAY_OF_WEEK_OPTIONS[day - 1]?.value as ScheduleDayType;
      if (dayOfMonth === "*") {
        schedule_frame = frameFromCron[dayOfWeekParts[1]];
      } else {
        schedule_frame = frameFromCron[dayOfMonth];
      }
    }
  } else {
    if (dayOfWeek === "*") {
      schedule_day = undefined;
    } else {
      schedule_day = DAY_OF_WEEK_OPTIONS[parseInt(dayOfWeek) - 1]
        ?.value as ScheduleDayType;
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
