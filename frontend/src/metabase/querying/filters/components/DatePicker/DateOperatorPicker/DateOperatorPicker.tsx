import { useMemo } from "react";

import type {
  DatePickerOperator,
  DatePickerValue,
} from "metabase/querying/filters/types";
import { Select } from "metabase/ui";

import { getAvailableOptions, getOptionType, setOptionType } from "./utils";

interface DateOperatorPickerProps {
  value?: DatePickerValue;
  availableOperators: DatePickerOperator[];
  onChange: (value: DatePickerValue | undefined) => void;
}

export function DateOperatorPicker({
  value,
  availableOperators,
  onChange,
}: DateOperatorPickerProps) {
  const options = useMemo(() => {
    return getAvailableOptions(availableOperators);
  }, [availableOperators]);

  const optionType = useMemo(() => {
    return getOptionType(value);
  }, [value]);

  const handleChange = (inputValue: string | null) => {
    const option = options.find((option) => option.value === inputValue);
    if (option) {
      onChange(setOptionType(value, option.value));
    }
  };

  return (
    <Select
      data={options}
      value={optionType}
      onChange={handleChange}
      style={{
        flex: 1,
      }}
      comboboxProps={{
        withinPortal: false,
        floatingStrategy: "fixed",
        position: "top",
      }}
    />
  );
}
