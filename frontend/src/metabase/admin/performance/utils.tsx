import { match } from "ts-pattern";
import { c, t } from "ttag";
import { memoize } from "underscore";
import type { SchemaObjectDescription } from "yup/lib/schema";

import {
  Cron,
  getScheduleStrings,
} from "metabase/common/components/Schedule/strings";
import { isNullOrUndefined } from "metabase/lib/types";
import { PLUGIN_CACHING } from "metabase/plugins";
import type {
  AdaptiveStrategy,
  CacheConfig,
  CacheStrategy,
  CacheStrategyType,
  CacheableModel,
  ScheduleDayType,
  ScheduleFrameType,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

import { defaultMinDurationMs, rootId } from "./constants/simple";
import type { PerformanceTabId, StrategyData, StrategyLabel } from "./types";

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
          t`The cron expression contains an invalid weekday: ${weekday}`,
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
            t`The cron expression contains an invalid weekday: ${weekday}`,
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

const defaultSchedule: ScheduleSettings = {
  schedule_type: "hourly",
  schedule_minute: 0,
};
export const defaultCron = scheduleSettingsToCron(defaultSchedule);

const isValidAmPm = (amPm: number) => amPm === AM || amPm === PM;

export const hourToTwelveHourFormat = (hour: number) => hour % 12 || 12;

export const hourTo24HourFormat = (hour: number, amPm: number): number => {
  if (!isValidAmPm(amPm)) {
    amPm = AM;
  }
  const hour24 = amPm === PM ? (hour % 12) + 12 : hour % 12;
  return hour24 === 24 ? 0 : hour24;
};

type ErrorWithMessage = { data: { message: string } };
export const isErrorWithMessage = (error: unknown): error is ErrorWithMessage =>
  typeof error === "object" &&
  error !== null &&
  "data" in error &&
  typeof (error as { data: any }).data === "object" &&
  "message" in (error as { data: any }).data &&
  typeof (error as { data: { message: any } }).data.message === "string";

const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/** To prevent UI jumpiness, ensure a minimum delay before continuing.
 * An example of jumpiness: clicking a save button results in
 * displaying a loading spinner for 10 ms and then a success message */
export const resolveSmoothly = async (
  promises: Promise<any>[],
  timeout: number = 300,
) => {
  return await Promise.all([delay(timeout), ...promises]);
};

export const getFrequencyFromCron = (cron: string) => {
  const scheduleType = cronToScheduleSettings(cron)?.schedule_type;
  const { scheduleOptionNames } = getScheduleStrings();
  return isNullOrUndefined(scheduleType)
    ? ""
    : scheduleOptionNames[scheduleType];
};

export const isValidStrategyName = (
  strategy: string,
): strategy is CacheStrategyType => {
  const { strategies } = PLUGIN_CACHING;
  const validStrategyNames = new Set(Object.keys(strategies));
  return validStrategyNames.has(strategy);
};

export const getLabelString = (label: StrategyLabel, model?: CacheableModel) =>
  typeof label === "string" ? label : label(model);

export const getShortStrategyLabel = (
  strategy?: CacheStrategy,
  model?: CacheableModel,
) => {
  const { strategies } = PLUGIN_CACHING;
  if (!strategy) {
    return null;
  }
  const type = strategies[strategy.type];
  const mainLabel = getLabelString(type.shortLabel ?? type.label, model);
  /** Part of the label shown after the colon */
  const subLabel = match(strategy)
    .with({ type: "schedule" }, (strategy) =>
      getFrequencyFromCron(strategy.schedule),
    )
    .with(
      { type: "duration" },
      (strategy) =>
        c(
          "{0} is a number. Indicates a number of hours (the length of a cache)",
        ).t`${strategy.duration}h`,
    )
    .otherwise(() => null);
  if (subLabel) {
    return c(
      "{0} is the primary label for a cache invalidation strategy. {1} is a further description.",
    ).t`${mainLabel}: ${subLabel}`;
  } else {
    return mainLabel;
  }
};

export const getStrategyValidationSchema = (strategyData: StrategyData) => {
  if (typeof strategyData.validationSchema === "function") {
    return strategyData.validationSchema();
  } else {
    return strategyData.validationSchema;
  }
};

export const getFieldsForStrategyType = (strategyType: CacheStrategyType) => {
  const { strategies } = PLUGIN_CACHING;
  const strategyData = strategies[strategyType];
  const validationSchemaDescription = getStrategyValidationSchema(
    strategyData,
  ).describe() as SchemaObjectDescription;
  const fieldRecord = validationSchemaDescription.fields;
  const fields = Object.keys(fieldRecord);
  return fields;
};

export const translateConfig = <T extends CacheConfig>(
  config: T,
  direction: "fromAPI" | "toAPI",
): T => {
  const translated = { ...config, strategy: { ...config.strategy } } as T;

  // If strategy type is unsupported, use a fallback
  if (!isValidStrategyName(translated.strategy.type)) {
    translated.strategy.type =
      translated.model_id === rootId ? "nocache" : "inherit";
  }

  if (translated.strategy.type === "ttl") {
    if (direction === "fromAPI") {
      translated.strategy = populateMinDurationSeconds(translated.strategy);
    } else {
      translated.strategy.min_duration_ms =
        translated.strategy.min_duration_seconds === undefined
          ? defaultMinDurationMs
          : translated.strategy.min_duration_seconds * 1000;
      delete translated.strategy.min_duration_seconds;
    }
  }
  return translated;
};

export const populateMinDurationSeconds = (strategy: AdaptiveStrategy) => ({
  ...strategy,
  min_duration_seconds: Math.ceil(strategy.min_duration_ms / 1000),
});

/** Translate a config from the API into a format the frontend can use */
export const translateConfigFromAPI = <T extends CacheConfig>(config: T): T =>
  translateConfig(config, "fromAPI");

/** Translate a config from the frontend's format into the API's preferred format */
export const translateConfigToAPI = <T extends CacheConfig>(config: T): T =>
  translateConfig(config, "toAPI");

export const getPerformanceTabName = (tabId: PerformanceTabId) =>
  PLUGIN_CACHING.getTabMetadata().find(
    ({ key }) => key === `performance-${tabId}`,
  )?.name;

export const getDefaultValueForField = (
  strategyType: CacheStrategyType,
  fieldName?: string,
) => {
  const schema = getStrategyValidationSchema(
    PLUGIN_CACHING.strategies[strategyType],
  );
  return fieldName ? schema.cast({})[fieldName] : "";
};
