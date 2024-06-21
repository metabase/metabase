import { useMemo } from "react";

import { Group, Stack, Select } from "metabase/ui";

import { SimpleRelativeDatePicker } from "../RelativeDatePicker";
import { IncludeCurrentSwitch } from "../RelativeDatePicker/IncludeCurrentSwitch";
import { isIntervalValue, isRelativeValue } from "../RelativeDatePicker/utils";
import { SimpleSpecificDatePicker } from "../SpecificDatePicker";
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
      <Group>
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
      </Group>
      {isRelativeValue(value) && isIntervalValue(value) && (
        <IncludeCurrentSwitch value={value} onChange={onChange} />
      )}
      {value?.type === "specific" && (
        <SimpleSpecificDatePicker value={value} onChange={onChange} />
      )}
    </Stack>
  );
}
