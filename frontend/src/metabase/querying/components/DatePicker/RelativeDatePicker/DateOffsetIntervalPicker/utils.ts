import { t } from "ttag";
import * as Lib from "metabase-lib";
import type {
  DatePickerTruncationUnit,
  RelativeIntervalDirection,
} from "../../types";
import { DATE_PICKER_TRUNCATION_UNITS } from "../../constants";
import type { DateIntervalValue, DateOffsetIntervalValue } from "../types";
import { getDirection } from "../utils";

export function getDirectionText(value: DateOffsetIntervalValue): string {
  const direction = getDirection(value);
  return direction === "last" ? t`Past` : t`Next`;
}

export function setUnit(
  value: DateOffsetIntervalValue,
  unit: DatePickerTruncationUnit,
): DateOffsetIntervalValue {
  return { ...value, unit, offsetUnit: unit };
}

export function getOffsetInterval(value: DateOffsetIntervalValue): number {
  return Math.abs(value.offsetValue);
}

export function setOffsetInterval(
  value: DateOffsetIntervalValue,
  offsetValue: number,
): DateOffsetIntervalValue {
  if (offsetValue === 0) {
    return { ...value, offsetValue: 0 };
  } else {
    const sign = Math.sign(value.value);
    return { ...value, offsetValue: Math.max(Math.abs(offsetValue), 0) * sign };
  }
}

export function setOffsetUnit(
  value: DateOffsetIntervalValue,
  offsetUnit: DatePickerTruncationUnit,
): DateOffsetIntervalValue {
  return { ...value, offsetUnit };
}

export function removeOffset(
  value: DateOffsetIntervalValue,
): DateIntervalValue {
  return { ...value, offsetValue: undefined, offsetUnit: undefined };
}

export function getOffsetUnitOptions(value: DateOffsetIntervalValue) {
  const direction = getDirection(value);
  const unitIndex = DATE_PICKER_TRUNCATION_UNITS.indexOf(value.unit);

  return DATE_PICKER_TRUNCATION_UNITS.filter(
    (_, index) => index >= unitIndex,
  ).map(unit => ({
    value: unit,
    label: getOffsetUnitText(unit, direction, value.offsetValue),
  }));
}

function getOffsetUnitText(
  unit: DatePickerTruncationUnit,
  direction: RelativeIntervalDirection,
  interval: number,
) {
  const unitText = Lib.describeTemporalUnit(unit, interval).toLowerCase();
  return direction === "last" ? t`${unitText} ago` : t`${unitText} from now`;
}
