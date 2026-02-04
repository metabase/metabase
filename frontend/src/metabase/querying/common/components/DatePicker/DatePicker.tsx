import { type ReactNode, useState } from "react";

import {
  DATE_PICKER_DIRECTIONS,
  DATE_PICKER_OPERATORS,
  DATE_PICKER_SHORTCUTS,
  DATE_PICKER_UNITS,
} from "../../constants";
import type {
  DatePickerOperator,
  DatePickerShortcut,
  DatePickerUnit,
  DatePickerValue,
  RelativeIntervalDirection,
} from "../../types";

import { DateShortcutPicker } from "./DateShortcutPicker";
import { ExcludeDatePicker } from "./ExcludeDatePicker";
import { RelativeDatePicker } from "./RelativeDatePicker";
import { SpecificDatePicker } from "./SpecificDatePicker";
import type { DatePickerSubmitButtonProps } from "./types";
import { renderDefaultSubmitButton } from "./utils";

type DatePickerProps = {
  value?: DatePickerValue;
  availableOperators?: DatePickerOperator[];
  availableShortcuts?: DatePickerShortcut[];
  availableUnits?: DatePickerUnit[];
  availableDirections?: RelativeIntervalDirection[];
  renderSubmitButton?: (props: DatePickerSubmitButtonProps) => ReactNode;
  renderBackButton?: () => ReactNode;
  onChange: (value: DatePickerValue) => void;
  readOnly?: boolean;
};

export function DatePicker({
  value,
  availableOperators = DATE_PICKER_OPERATORS,
  availableShortcuts = DATE_PICKER_SHORTCUTS,
  availableUnits = DATE_PICKER_UNITS,
  availableDirections = DATE_PICKER_DIRECTIONS,
  renderSubmitButton = renderDefaultSubmitButton,
  renderBackButton,
  onChange,
  readOnly,
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
          availableUnits={availableUnits}
          renderSubmitButton={renderSubmitButton}
          onChange={onChange}
          onBack={handleBack}
          readOnly={readOnly}
        />
      );
    case "relative":
      return (
        <RelativeDatePicker
          value={value?.type === type ? value : undefined}
          availableUnits={availableUnits}
          availableDirections={availableDirections}
          renderSubmitButton={renderSubmitButton}
          onChange={onChange}
          onBack={handleBack}
          readOnly={readOnly}
        />
      );
    case "exclude":
      return (
        <ExcludeDatePicker
          value={value?.type === type ? value : undefined}
          availableOperators={availableOperators}
          availableUnits={availableUnits}
          renderSubmitButton={renderSubmitButton}
          onChange={onChange}
          onBack={handleBack}
          readOnly={readOnly}
        />
      );
    default:
      return (
        <DateShortcutPicker
          availableOperators={availableOperators}
          availableShortcuts={availableShortcuts}
          availableDirections={availableDirections}
          renderBackButton={renderBackButton}
          onChange={onChange}
          onSelectType={setType}
        />
      );
  }
}
