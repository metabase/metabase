import { useMemo } from "react";

import { Stack, Select } from "metabase/ui";

import { SimpleRelativeDatePicker } from "../RelativeDatePicker";
import { isRelativeValue } from "../RelativeDatePicker/utils";
import type { DatePickerOperator, DatePickerValue } from "../types";

import { getAvailableOptions, getOptionType, setOptionType } from "./utils";

interface DateOperatorPickerProps {
  value?: DatePickerValue;
  availableOperators: ReadonlyArray<DatePickerOperator>;
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
    const option = options.find(option => option.value === inputValue);
    if (option) {
      onChange(setOptionType(value, option.value));
    }
  };

  return (
    <Stack>
      <Select
        data={options}
        value={optionType}
        onChange={handleChange}
        style={{
          flex: 1,
        }}
      />
      {isRelativeValue(value) && (
        <SimpleRelativeDatePicker value={value} onChange={onChange} />
      )}
    </Stack>
  );
}
