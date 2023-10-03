import { useState } from "react";
import { ExcludeDatePicker } from "./ExcludeDatePicker";
import { DateShortcutPicker } from "./DateShortcutPicker";
import {
  DEFAULT_OPERATORS,
  DEFAULT_SHORTCUTS,
  DEFAULT_UNITS,
} from "./constants";
import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  DatePickerShortcut,
  DatePickerValue,
  ExcludeDatePickerValue,
} from "./types";

export interface DatePickerProps {
  value?: DatePickerValue;
  availableOperators?: DatePickerOperator[];
  availableShortcuts?: DatePickerShortcut[];
  availableUnits?: DatePickerExtractionUnit[];
  onChange: (value: ExcludeDatePickerValue) => void;
}

export function DatePicker({
  value,
  availableOperators = DEFAULT_OPERATORS,
  availableShortcuts = DEFAULT_SHORTCUTS,
  availableUnits = DEFAULT_UNITS,
  onChange,
}: DatePickerProps) {
  const [type, setType] = useState(value?.type);

  const handleBack = () => {
    setType(undefined);
  };

  switch (type) {
    case "exclude":
      return (
        <ExcludeDatePicker
          value={value?.type === type ? value : undefined}
          availableOperators={availableOperators}
          availableUnits={availableUnits}
          onChange={onChange}
          onBack={handleBack}
        />
      );
    default:
      return (
        <DateShortcutPicker
          availableShortcuts={availableShortcuts}
          onChange={onChange}
          onSelect={setType}
        />
      );
  }
}
