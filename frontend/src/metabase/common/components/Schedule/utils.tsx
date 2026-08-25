import type { ReactNode } from "react";
import { match } from "ts-pattern";
import _ from "underscore";

import type { SelectProps } from "metabase/ui";
import type { FontStyle } from "metabase/utils/measure-text";
import { measureTextWidth } from "metabase/utils/measure-text";
import { isNotNull } from "metabase/utils/types";
import type { ScheduleSettings } from "metabase-types/api";

import { defaultDay, defaultHour } from "./constants";
import type {
  ScheduleBuilderType,
  ScheduleBuilderValue,
  ScheduleValue,
} from "./types";
import { isScheduleCronValue } from "./types";

export const combineConsecutiveStrings = (arr: ReactNode[]) => {
  return arr.reduce<ReactNode[]>((acc, node) => {
    const previousNode = acc.at(-1);
    if (typeof node === "string" && typeof previousNode === "string") {
      return [...acc.slice(0, acc.length - 1), previousNode + ` ${node}`];
    }
    if (typeof node === "string" && !node.trim()) {
      return acc;
    }
    return [...acc, typeof node === "string" ? node.trim() : node];
  }, []);
};

export const getLongestSelectLabel = (
  data: SelectProps<string | null>["data"] | { value: string }[] = [],
  fontFamily?: string,
): string => {
  const width = (str: string) =>
    measureTextWidthSafely(str, str.length, { family: fontFamily });
  return [...data].reduce<string>((acc: string, option) => {
    let label: string;
    if (typeof option === "string") {
      label = option;
    } else if (!option) {
      label = "";
    } else if ("label" in option) {
      label = option.label;
    } else if ("group" in option) {
      label = getLongestSelectLabel(option.items);
    } else {
      label = "";
    }
    return width(label) > width(acc) ? label : acc;
  }, "");
};

/** Since measureTextWidth can throw an error, this function catches the error and returns a default width
 *
 * Note that you may want to set the style prop to reflect the currently chosen font family, like this:
 * ```
 *    const fontFamily = useSelector(state => getSetting(state, "application-font"));
 *    measureTextWidthSafely("string", 50, {family: fontFamily});
 * ```
 * */
export const measureTextWidthSafely = _.memoize(
  (text: string, defaultWidth: number, style?: Partial<FontStyle>) => {
    try {
      return measureTextWidth(text, style);
    } catch (e) {
      console.error(`Error while measuring text width:`, e);
      return defaultWidth;
    }
  },
  function hashFunction(...args) {
    return JSON.stringify(args);
  },
);

const SCHEDULE_FIELDS = [
  "schedule_day",
  "schedule_frame",
  "schedule_hour",
  "schedule_minute",
] as const;

export type ScheduleField = (typeof SCHEDULE_FIELDS)[number];

export type ScheduleDefaults = {
  [Field in ScheduleField]: ScheduleSettings[Field];
};

type ScheduleFieldSpecs = {
  defaults: ScheduleDefaults;
  cron: Partial<Record<ScheduleField, "required" | "wildcard">>;
};

export type GetScheduleDefaults = (
  scheduleType: ScheduleBuilderType,
) => ScheduleDefaults;

const getScheduleFieldSpecs = (
  scheduleType: ScheduleBuilderType,
): ScheduleFieldSpecs =>
  match<ScheduleBuilderType, ScheduleFieldSpecs>(scheduleType)
    .with("every_n_minutes", () => ({
      defaults: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: null,
        schedule_minute: 10,
      },
      cron: { schedule_minute: "wildcard" },
    }))
    .with("hourly", () => ({
      defaults: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: null,
        schedule_minute: 0,
      },
      cron: { schedule_minute: "wildcard" },
    }))
    .with("daily", () => ({
      defaults: {
        schedule_day: null,
        schedule_frame: null,
        schedule_hour: defaultHour,
        schedule_minute: 0,
      },
      cron: { schedule_hour: "required", schedule_minute: "wildcard" },
    }))
    .with("weekly", () => ({
      defaults: {
        schedule_day: defaultDay,
        schedule_frame: null,
        schedule_hour: defaultHour,
        schedule_minute: 0,
      },
      cron: {
        schedule_day: "required",
        schedule_hour: "required",
        schedule_minute: "wildcard",
      },
    }))
    .with("monthly", () => ({
      defaults: {
        schedule_day: null,
        schedule_frame: "first",
        schedule_hour: defaultHour,
        schedule_minute: 0,
      },
      cron: {
        schedule_day: "wildcard",
        schedule_frame: "required",
        schedule_hour: "required",
        schedule_minute: "wildcard",
      },
    }))
    .exhaustive();

export const getScheduleDefaults = (
  scheduleType: ScheduleBuilderType,
): ScheduleDefaults => getScheduleFieldSpecs(scheduleType).defaults;

export const getScheduleDefaultsWithoutHour = (
  scheduleType: ScheduleBuilderType,
): ScheduleDefaults => ({
  ...getScheduleDefaults(scheduleType),
  schedule_hour: null,
});

const getScheduleFieldsInCron = (
  scheduleType: ScheduleBuilderType,
): ScheduleField[] => {
  const { cron } = getScheduleFieldSpecs(scheduleType);
  return SCHEDULE_FIELDS.filter((field) => cron[field]);
};

export const getRequiredScheduleFields = (
  scheduleType: ScheduleBuilderType,
): ScheduleField[] => {
  const { cron } = getScheduleFieldSpecs(scheduleType);
  return SCHEDULE_FIELDS.filter((field) => cron[field] === "required");
};

export const clearDayForMidFrame = (
  schedule: ScheduleBuilderValue,
): ScheduleBuilderValue =>
  schedule.schedule_frame === "mid"
    ? { ...schedule, schedule_day: null }
    : schedule;

export const clearUnusedScheduleFields = (
  schedule: ScheduleBuilderValue,
  getFieldValue: (field: ScheduleField) => ScheduleSettings[ScheduleField] = (
    field,
  ) => schedule[field],
): ScheduleBuilderValue => {
  const { schedule_type } = schedule;
  const fieldsInCron = getScheduleFieldsInCron(schedule_type);

  return clearDayForMidFrame(
    SCHEDULE_FIELDS.reduce<ScheduleBuilderValue>(
      (memo, field) => ({
        ...memo,
        [field]: fieldsInCron.includes(field) ? getFieldValue(field) : null,
      }),
      { schedule_type },
    ),
  );
};

const hasSameMeaningInBothTypes = (
  field: ScheduleField,
  previousType: ScheduleBuilderType,
  nextType: ScheduleBuilderType,
): boolean =>
  field !== "schedule_minute" ||
  (previousType === "every_n_minutes") === (nextType === "every_n_minutes");

export const changeScheduleType = (
  previousValue: ScheduleBuilderValue,
  nextType: ScheduleBuilderType,
  getDefaults: GetScheduleDefaults,
): ScheduleBuilderValue => {
  const defaults = getDefaults(nextType);
  const isFieldCarriedOver = (field: ScheduleField) =>
    hasSameMeaningInBothTypes(field, previousValue.schedule_type, nextType) &&
    isNotNull(previousValue[field]);

  return clearUnusedScheduleFields(
    { ...previousValue, schedule_type: nextType },
    (field) =>
      isFieldCarriedOver(field) ? previousValue[field] : defaults[field],
  );
};

export const toScheduleSettings = (value: ScheduleValue): ScheduleSettings => {
  if (isScheduleCronValue(value) || value.schedule_type === "every_n_minutes") {
    throw new Error(
      `A ${value.schedule_type} schedule cannot be stored as a schedule map`,
    );
  }
  return { ...value, schedule_type: value.schedule_type };
};

export const isScheduleComplete = (value: ScheduleValue): boolean =>
  isScheduleCronValue(value) ||
  getRequiredScheduleFields(value.schedule_type).every((field) =>
    isNotNull(value[field]),
  );

export const normalizeScheduleValue = (
  value: ScheduleValue,
  getDefaults: GetScheduleDefaults,
): ScheduleValue =>
  isScheduleCronValue(value)
    ? value
    : changeScheduleType(value, value.schedule_type, getDefaults);
