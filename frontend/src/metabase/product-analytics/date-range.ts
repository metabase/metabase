import type { DatePickerValue } from "metabase/querying/common/types";
import {
  deserializeDateParameterValue,
  serializeDateParameterValue,
} from "metabase/querying/parameters/utils/parsing";

import { PROTOTYPE_RANGE_DAYS } from "./config";

/*
 * Date ranges are stored in the dashboard date-filter format ("past90days"),
 * because a DatePickerValue holds Date objects that don't survive JSON.
 */

export const serializeDateRange = (value: DatePickerValue): string =>
  serializeDateParameterValue(value);

export const parseDateRange = (value: string): DatePickerValue | undefined => {
  const parsed = deserializeDateParameterValue(value);
  if (parsed === null || parsed.type === "month" || parsed.type === "quarter") {
    return undefined;
  }
  return parsed;
};

export const DEFAULT_DATE_RANGE = serializeDateRange({
  type: "relative",
  value: -PROTOTYPE_RANGE_DAYS,
  unit: "day",
});
