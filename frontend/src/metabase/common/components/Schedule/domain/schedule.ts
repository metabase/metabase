import _ from "underscore";

import { isNotNull } from "metabase/utils/types";

import type {
  GetScheduleDefaults,
  NormalizedScheduleBuilderValue,
  NormalizedScheduleValue,
  ScheduleBuilderType,
  ScheduleBuilderValue,
  ScheduleCronValue,
  ScheduleField,
  ScheduleFields,
  ScheduleSpecification,
  ScheduleValue,
} from "./types";

export const SCHEDULE_FIELDS = [
  "schedule_day",
  "schedule_frame",
  "schedule_hour",
  "schedule_minute",
] as const satisfies readonly ScheduleField[];

/**
 * Describes each builder type in terms of its fields:
 *
 * - `variables` are the fields the user picks in the UI. `unit` names what the
 *   field means for that type, e.g. `schedule_minute` is a minute past the
 *   hour for `hourly` but an interval for `every_n_minutes`. `nullable`
 *   variables may stay unpicked without making the schedule incomplete.
 * - `constants` are fields the type needs in the cron but never shows, so
 *   they are pinned to a fixed value.
 * - `defaults` fill in the variables that have no value yet.
 *
 * Every other field is `null` for that type.
 *
 * When the type changes, a picked variable is carried over only when the new
 * type has the same variable with the same unit; everything else comes from
 * the constants and the defaults of the new type. A loaded value keeps a
 * constant field as is (e.g. a custom cron may hold a daily schedule at 8:30)
 * so that saving it unchanged does not alter it, but the first edit in the UI
 * resets it to the constant so that what the UI shows is what the cron says.
 */
export const SCHEDULE_SPECIFICATIONS: Record<
  ScheduleBuilderType,
  ScheduleSpecification
> = {
  every_n_minutes: {
    variables: { schedule_minute: { unit: "interval", nullable: true } },
    constants: {},
    defaults: { schedule_minute: 10 },
  },
  hourly: {
    variables: { schedule_minute: { unit: "minute", nullable: true } },
    constants: {},
    defaults: { schedule_minute: 0 },
  },
  daily: {
    variables: { schedule_hour: { unit: "hour" } },
    constants: { schedule_minute: 0 },
    defaults: { schedule_hour: 8 },
  },
  weekly: {
    variables: {
      schedule_day: { unit: "weekday" },
      schedule_hour: { unit: "hour" },
    },
    constants: { schedule_minute: 0 },
    defaults: { schedule_day: "mon", schedule_hour: 8 },
  },
  monthly: {
    variables: {
      schedule_frame: { unit: "frame" },
      schedule_day: { unit: "weekday", nullable: true },
      schedule_hour: { unit: "hour" },
    },
    constants: { schedule_minute: 0 },
    defaults: {
      schedule_frame: "first",
      schedule_day: null,
      schedule_hour: 8,
    },
  },
};

export const getScheduleDefaults: GetScheduleDefaults = (scheduleType) =>
  SCHEDULE_SPECIFICATIONS[scheduleType].defaults;

export const isScheduleCronValue = (
  value: ScheduleValue,
): value is ScheduleCronValue => value.schedule_type === "cron";

const isNormalizedScheduleBuilderValue = (
  schedule: ScheduleBuilderValue,
): schedule is NormalizedScheduleBuilderValue => {
  const { variables, constants } =
    SCHEDULE_SPECIFICATIONS[schedule.schedule_type];
  return SCHEDULE_FIELDS.every((field) => {
    if (field in variables) {
      return true;
    }
    if (field in constants) {
      return isNotNull(schedule[field]);
    }
    return schedule[field] === null;
  });
};

const finalizeScheduleValue = (
  schedule: ScheduleBuilderValue,
  errorMessage: string,
): NormalizedScheduleBuilderValue => {
  const nextValue =
    schedule.schedule_frame === "mid"
      ? { ...schedule, schedule_day: null }
      : schedule;
  if (!isNormalizedScheduleBuilderValue(nextValue)) {
    throw new Error(errorMessage);
  }
  return nextValue;
};

const buildNormalizedScheduleBuilderValue = (
  scheduleType: ScheduleBuilderType,
  picked: ScheduleFields,
  getDefaults: GetScheduleDefaults,
): NormalizedScheduleBuilderValue => {
  const { variables, constants } = SCHEDULE_SPECIFICATIONS[scheduleType];
  const sources = [picked, constants, getDefaults(scheduleType)];
  const schedule = SCHEDULE_FIELDS.reduce<ScheduleBuilderValue>(
    (memo, field) => {
      if (!(field in variables) && !(field in constants)) {
        return { ...memo, [field]: null };
      }
      const value = sources.map((source) => source[field]).find(isNotNull);
      return { ...memo, [field]: value ?? null };
    },
    { schedule_type: scheduleType },
  );

  return finalizeScheduleValue(
    schedule,
    `Could not normalize a ${scheduleType} schedule`,
  );
};

const pickCarriedOver = (
  previousValue: ScheduleBuilderValue,
  nextType: ScheduleBuilderType,
): ScheduleFields => {
  const previousVariables =
    SCHEDULE_SPECIFICATIONS[previousValue.schedule_type].variables;
  const nextVariables = SCHEDULE_SPECIFICATIONS[nextType].variables;
  const carriedFields = SCHEDULE_FIELDS.filter(
    (field) =>
      field in nextVariables &&
      previousVariables[field]?.unit === nextVariables[field]?.unit,
  );
  return _.pick(previousValue, carriedFields);
};

export const changeScheduleType = (
  previousValue: ScheduleBuilderValue,
  nextType: ScheduleBuilderType,
  getDefaults: GetScheduleDefaults,
): NormalizedScheduleBuilderValue =>
  buildNormalizedScheduleBuilderValue(
    nextType,
    pickCarriedOver(previousValue, nextType),
    getDefaults,
  );

export const normalizeScheduleValue = (
  value: ScheduleValue,
  getDefaults: GetScheduleDefaults,
): NormalizedScheduleValue => {
  if (isScheduleCronValue(value)) {
    return value;
  }
  return buildNormalizedScheduleBuilderValue(
    value.schedule_type,
    value,
    getDefaults,
  );
};

export const setScheduleField = <TField extends ScheduleField>(
  schedule: NormalizedScheduleBuilderValue,
  field: TField,
  value: Exclude<ScheduleFields[TField], undefined>,
): NormalizedScheduleBuilderValue =>
  finalizeScheduleValue(
    {
      ...schedule,
      ...SCHEDULE_SPECIFICATIONS[schedule.schedule_type].constants,
      [field]: value,
    },
    `${field} cannot be set on a ${schedule.schedule_type} schedule`,
  );

export const isScheduleComplete = (value: NormalizedScheduleValue): boolean => {
  if (isScheduleCronValue(value)) {
    return true;
  }
  const { variables } = SCHEDULE_SPECIFICATIONS[value.schedule_type];
  const requiredFields = SCHEDULE_FIELDS.filter((field) => {
    const variable = variables[field];
    return variable && !variable.nullable;
  });
  return requiredFields.every((field) => isNotNull(value[field]));
};
