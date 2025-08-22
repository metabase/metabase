import { type ReactNode, useState } from "react";

import {
  DATE_PICKER_OPERATORS,
  DATE_PICKER_SHORTCUTS,
  DATE_PICKER_UNITS,
} from "metabase/querying/filters/constants";
import type {
  DatePickerOperator,
  DatePickerShortcut,
  DatePickerUnit,
  DatePickerValue,
} from "metabase/querying/filters/types";

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
          renderBackButton={renderBackButton}
          onChange={onChange}
          onSelectType={setType}
        />
      );
  }
}
