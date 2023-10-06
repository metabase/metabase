import { t } from "ttag";
import * as Lib from "metabase-lib";
import type { DatePickerTruncationUnit } from "../../types";
import { DATE_PICKER_TRUNCATION_UNITS } from "../../constants";
import type { DateOffsetIntervalValue, IntervalDirection } from "../types";
import { getDirection } from "../utils";

export function setUnit(
  value: DateOffsetIntervalValue,
  unit: DatePickerTruncationUnit,
): DateOffsetIntervalValue {
  return { ...value, unit, offsetUnit: unit };
}

export function setOffsetInterval(
  value: DateOffsetIntervalValue,
  offsetValue: number,
): DateOffsetIntervalValue {
  return { ...value, offsetValue: Math.max(Math.abs(offsetValue), 1) };
}

export function setOffsetUnit(
  value: DateOffsetIntervalValue,
  offsetUnit: DatePickerTruncationUnit,
): DateOffsetIntervalValue {
  return { ...value, offsetUnit };
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
  direction: IntervalDirection,
  interval: number,
) {
  const unitText = Lib.describeTemporalUnit(unit, interval).toLowerCase();
  const directionText = direction === "last" ? t`ago` : t`from now`;
  return `${unitText} ${directionText}`;
}
