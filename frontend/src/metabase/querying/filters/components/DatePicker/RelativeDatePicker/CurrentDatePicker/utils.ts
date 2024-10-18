import type {
  DatePickerTruncationUnit,
  DatePickerUnit,
  RelativeDatePickerValue,
} from "../../types";

import { UNIT_GROUPS } from "./constants";

export function getCurrentValue(
  unit: DatePickerTruncationUnit,
): RelativeDatePickerValue {
  return { type: "relative", value: "current", unit };
}

export function getUnitGroups(availableUnits: ReadonlyArray<DatePickerUnit>) {
  return UNIT_GROUPS.map(group =>
    group.filter(unit => availableUnits.includes(unit)),
  ).filter(group => group.length > 0);
}
