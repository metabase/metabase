import type {
  DateTimeRelativeUnit,
  DateTimeAbsoluteUnit,
} from "metabase-types/api";
import {
  dateTimeAbsoluteUnits,
  dateTimeRelativeUnits,
} from "metabase-types/api";

export const isAbsoluteDateTimeUnit = (
  value: unknown,
): value is DateTimeAbsoluteUnit => {
  return dateTimeAbsoluteUnits.includes(value as DateTimeAbsoluteUnit);
};

export const isRelativeDateTimeUnit = (
  value: unknown,
): value is DateTimeAbsoluteUnit => {
  return dateTimeRelativeUnits.includes(value as DateTimeRelativeUnit);
};
