import * as Lib from "metabase-lib";
import { DATE_PICKER_TRUNCATION_UNITS } from "../constants";
import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "../types";

export function getCurrentValue(
  unit: DatePickerTruncationUnit,
): RelativeDatePickerValue {
  return {
    type: "relative",
    unit,
    value: "current",
    offsetUnit: null,
    offsetValue: null,
  };
}

export function getUnitOptions() {
  return DATE_PICKER_TRUNCATION_UNITS.map(unit => ({
    value: unit,
    label: Lib.describeTemporalUnit(unit),
  }));
}
