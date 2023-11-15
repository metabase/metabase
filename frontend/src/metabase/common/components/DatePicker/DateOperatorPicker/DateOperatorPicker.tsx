import { useMemo } from "react";
import { Group, Select, Stack } from "metabase/ui";
import { SimpleRelativeDatePicker } from "../RelativeDatePicker";
import { SimpleSpecificDatePicker } from "../SpecificDatePicker";
import type { DatePickerOperator, DatePickerValue } from "../types";
import { getAvailableOperators, getOperatorType } from "./utils";

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
    return getAvailableOperators(availableOperators);
  }, [availableOperators]);

  const optionType = useMemo(() => {
    return getOperatorType(value);
  }, [value]);

  return (
    <Stack>
      <Group>
        <Select data={options} value={optionType} />
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
