import { t } from "ttag";

import * as Lib from "metabase-lib";

import type {
  DatePickerTruncationUnit,
  DatePickerUnit,
  RelativeDatePickerValue,
  RelativeIntervalDirection,
} from "../../../../types";
import { getAvailableTruncationUnits, getDirection } from "../utils";

export function getDirectionText(value: RelativeDatePickerValue): string {
  const direction = getDirection(value);
  return direction === "past" ? t`Previous` : t`Next`;
}

export function setUnit(
  value: RelativeDatePickerValue,
  unit: DatePickerTruncationUnit,
): RelativeDatePickerValue {
  return { ...value, unit, offsetUnit: unit };
}

export function getOffsetInterval(value: RelativeDatePickerValue): number {
  return Math.abs(value.offsetValue ?? 0);
}

export function setOffsetInterval(
  value: RelativeDatePickerValue,
  offsetValue: number,
): RelativeDatePickerValue {
  if (offsetValue === 0) {
    return { ...value, offsetValue: 0 };
  } else {
    const sign = Math.sign(value.value);
    return { ...value, offsetValue: Math.max(Math.abs(offsetValue), 0) * sign };
  }
}

export function setOffsetUnit(
  value: RelativeDatePickerValue,
  offsetUnit: DatePickerTruncationUnit,
): RelativeDatePickerValue {
  return { ...value, offsetUnit };
}

export function removeOffset(
  value: RelativeDatePickerValue,
): RelativeDatePickerValue {
  return { ...value, offsetValue: undefined, offsetUnit: undefined };
}

export function getOffsetUnitOptions(
  value: RelativeDatePickerValue,
  availableUnits: DatePickerUnit[],
) {
  const truncationUnits = getAvailableTruncationUnits(availableUnits);
  const direction = getDirection(value);
  const unitIndex = truncationUnits.indexOf(value.unit);

  return truncationUnits
    .filter((_, index) => index >= unitIndex)
    .map((unit) => ({
      value: unit,
      label: getOffsetUnitText(unit, direction, value.offsetValue ?? 0),
    }));
}

function getOffsetUnitText(
  unit: DatePickerTruncationUnit,
  direction: RelativeIntervalDirection,
  interval: number,
) {
  const unitText = Lib.describeTemporalUnit(unit, interval).toLowerCase();
  return direction === "past" ? t`${unitText} ago` : t`${unitText} from now`;
}
