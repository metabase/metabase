import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "metabase/querying/common/types";
import * as Lib from "metabase-lib";

import { DEFAULT_OFFSETS } from "./constants";

export function setUnit(
  value: RelativeDatePickerValue,
  unit: DatePickerTruncationUnit,
): RelativeDatePickerValue {
  return { ...value, unit };
}

export function setDefaultOffset(
  value: RelativeDatePickerValue,
): RelativeDatePickerValue {
  return {
    ...value,
    offsetValue: DEFAULT_OFFSETS[value.unit] * Math.sign(value.value),
    offsetUnit: value.unit,
    options: undefined,
  };
}

export function getIncludeCurrent(value: RelativeDatePickerValue): boolean {
  return value.options?.includeCurrent ?? false;
}

export function getIncludeCurrentLabel(unit: DatePickerTruncationUnit): string {
  return Lib.describeTemporalInterval("current", unit).toLowerCase();
}

export function setIncludeCurrent(
  value: RelativeDatePickerValue,
  includeCurrent: boolean,
): RelativeDatePickerValue {
  return { ...value, options: { includeCurrent: includeCurrent } };
}
