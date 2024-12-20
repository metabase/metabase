import type {
  DatePickerTruncationUnit,
  DatePickerUnit,
  RelativeDatePickerValue,
} from "metabase/querying/filters/types";

import { UNIT_GROUPS } from "./constants";

export function getCurrentValue(
  unit: DatePickerTruncationUnit,
): RelativeDatePickerValue {
  return { type: "relative", value: "current", unit };
}

export function getUnitGroups(availableUnits: DatePickerUnit[]) {
  return UNIT_GROUPS.map(group =>
    group.filter(unit => availableUnits.includes(unit)),
  ).filter(group => group.length > 0);
}
