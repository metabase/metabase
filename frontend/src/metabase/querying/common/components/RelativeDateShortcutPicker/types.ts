import type { RelativeDatePickerValue } from "../../types";

export type ShortcutGroup = {
  label?: string;
  columns: number;
  shortcuts: Shortcut[];
};

export type Shortcut = {
  value: RelativeDatePickerValue;
  label: string;
};
