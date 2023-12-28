import { useMemo } from "react";
import { Group, Stack } from "metabase/ui";
import { SimpleRelativeDatePicker } from "../RelativeDatePicker";
import { SimpleSpecificDatePicker } from "../SpecificDatePicker";
import type { DatePickerOperator, DatePickerValue } from "../types";
import { getAvailableOptions, getOptionType, setOptionType } from "./utils";
import { FlexSelect } from "./DateOperatorPicker.styled";

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
      <Group>
        <FlexSelect data={options} value={optionType} onChange={handleChange} />
        {value?.type === "relative" && (
          <SimpleRelativeDatePicker value={value} onChange={onChange} />
        )}
      </Group>
      {value?.type === "specific" && (
        <SimpleSpecificDatePicker value={value} onChange={onChange} />
      )}
    </Stack>
  );
}
