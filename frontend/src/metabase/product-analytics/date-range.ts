import type { DatePickerValue } from "metabase/querying/common/types";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";

/**
 * The date picker value of a date range stored in the format dashboard date
 * filters use, like "past90days". `undefined` for anything the date picker
 * can't produce, including months and quarters.
 */
export const parseDateRange = (value: unknown): DatePickerValue | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = deserializeDateParameterValue(value);
  if (parsed === null || parsed.type === "month" || parsed.type === "quarter") {
    return undefined;
  }
  return parsed;
};
