import type {
  DatePickerOperator,
  DatePickerShortcut,
  DatePickerValueType,
  RelativeDatePickerValue,
} from "../types";

export interface ShortcutOption {
  label: string;
  shortcut: DatePickerShortcut;
  value: RelativeDatePickerValue;
}

export interface TypeOption {
  label: string;
  type: DatePickerValueType;
  operators: DatePickerOperator[];
}
