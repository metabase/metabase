import type { DateTimeAbsoluteUnit } from "metabase-types/api";
import { dateTimeAbsoluteUnits } from "metabase-types/api";

export const isAbsoluteDateTimeUnit = (
  value: unknown,
): value is DateTimeAbsoluteUnit => {
  // Unjustified type cast. FIXME
  return dateTimeAbsoluteUnits.includes(value as DateTimeAbsoluteUnit);
};
