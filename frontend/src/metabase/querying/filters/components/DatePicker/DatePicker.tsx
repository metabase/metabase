import type { ReactNode } from "react";
import { useState } from "react";

import { DateShortcutPicker } from "./DateShortcutPicker";
import { ExcludeDatePicker } from "./ExcludeDatePicker";
import { RelativeDatePicker } from "./RelativeDatePicker";
import { SpecificDatePicker } from "./SpecificDatePicker";
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

interface DatePickerProps {
  value?: DatePickerValue;
  availableOperators?: ReadonlyArray<DatePickerOperator>;
  availableShortcuts?: ReadonlyArray<DatePickerShortcut>;
  availableUnits?: ReadonlyArray<DatePickerExtractionUnit>;
  isNew?: boolean;
  canSetTime?: boolean;
  canSetRelativeOffset?: boolean;
  backButton?: ReactNode;
  onChange: (value: DatePickerValue) => void;
}

export function DatePicker({
  value,
  availableOperators = DATE_PICKER_OPERATORS,
  availableShortcuts = DATE_PICKER_SHORTCUTS,
  availableUnits = DATE_PICKER_EXTRACTION_UNITS,
  isNew = value == null,
  canSetTime = false,
  canSetRelativeOffset = false,
  backButton,
  onChange,
}: DatePickerProps) {
  const [type, setType] = useState(value?.type);

  const handleBack = () => {
    setType(undefined);
  };

  switch (type) {
    case "specific":
      return (
        <SpecificDatePicker
          value={value?.type === type ? value : undefined}
          availableOperators={availableOperators}
          isNew={isNew}
          canSetTime={canSetTime}
          onChange={onChange}
          onBack={handleBack}
        />
      );
    case "relative":
      return (
        <RelativeDatePicker
          value={value?.type === type ? value : undefined}
          isNew={isNew}
          canSetRelativeOffset={canSetRelativeOffset}
          onChange={onChange}
          onBack={handleBack}
        />
      );
    case "exclude":
      return (
        <ExcludeDatePicker
          value={value?.type === type ? value : undefined}
          availableOperators={availableOperators}
          availableUnits={availableUnits}
          isNew={isNew}
          onChange={onChange}
          onBack={handleBack}
        />
      );
    default:
      return (
        <DateShortcutPicker
          availableOperators={availableOperators}
          availableShortcuts={availableShortcuts}
          backButton={backButton}
          onChange={onChange}
          onSelectType={setType}
        />
      );
  }
}
