import type { DatePickerUnit } from "../../types";

import { UNIT_GROUPS } from "./constants";

export function getUnitGroups(availableUnits: ReadonlyArray<DatePickerUnit>) {
  return UNIT_GROUPS.map(group =>
    group.filter(unit => availableUnits.includes(unit)),
  ).filter(group => group.length > 0);
}
