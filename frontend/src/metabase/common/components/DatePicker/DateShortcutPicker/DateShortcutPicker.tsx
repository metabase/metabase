import type {
  DatePickerShortcut,
  DatePickerValueType,
  ExcludeDatePickerValue,
} from "../types";

interface DateShortcutPickerProps {
  availableShortcuts: DatePickerShortcut[];
  onChange: (value: ExcludeDatePickerValue) => void;
  onSelect: (type: DatePickerValueType) => void;
}

export function DateShortcutPicker({
  availableShortcuts,
}: DateShortcutPickerProps) {
  return <div />;
}
