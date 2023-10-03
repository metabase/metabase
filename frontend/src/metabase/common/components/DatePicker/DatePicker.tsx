import { useState } from "react";
import { ExcludeDatePicker } from "./ExcludeDatePicker";
import { DateShortcutPicker } from "./DateShortcutPicker";
import {
  DATE_PICKER_EXTRACTION_UNITS,
  DATE_PICKER_OPERATORS,
  DATE_PICKER_SHORTCUTS,
} from "./constants";
import type {
  DatePickerExtractionUnit,
  DatePickerOperator,
  DatePickerShortcut,
  DatePickerValue,
} from "./types";

export interface DatePickerProps {
  value?: DatePickerValue;
  availableOperators?: ReadonlyArray<DatePickerOperator>;
  availableShortcuts?: ReadonlyArray<DatePickerShortcut>;
  availableUnits?: ReadonlyArray<DatePickerExtractionUnit>;
  onChange: (value: DatePickerValue) => void;
}

export function DatePicker({
  value,
  availableOperators = DATE_PICKER_OPERATORS,
  availableShortcuts = DATE_PICKER_SHORTCUTS,
  availableUnits = DATE_PICKER_EXTRACTION_UNITS,
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
          availableOperators={availableOperators}
          availableShortcuts={availableShortcuts}
          onChange={onChange}
          onNavigate={setType}
        />
      );
  }
}
