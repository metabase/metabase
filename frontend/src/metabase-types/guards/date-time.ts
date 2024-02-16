import {
  type DateTimeAbsoluteUnit,
  dateTimeAbsoluteUnits,
} from "metabase-types/api";

export const isAbsoluteDateTimeUnit = (
  value: unknown,
): value is DateTimeAbsoluteUnit => {
  return dateTimeAbsoluteUnits.includes(value as DateTimeAbsoluteUnit);
};
