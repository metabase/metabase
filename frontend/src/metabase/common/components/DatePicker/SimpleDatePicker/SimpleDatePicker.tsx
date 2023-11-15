import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { t } from "ttag";
import { Button, Group, Select, Stack } from "metabase/ui";
import { SimpleRelativeDatePicker } from "../RelativeDatePicker";
import type { DatePickerOperator, DatePickerValue } from "../types";
import { getAvailableOptions, getOptionType } from "./utils";

interface SimpleDatePickerProps {
  initialValue?: DatePickerValue;
  availableOperators: DatePickerOperator[];
  onChange: (value: DatePickerValue | undefined) => void;
}

export function SimpleDatePicker({
  initialValue,
  availableOperators,
  onChange,
}: SimpleDatePickerProps) {
  const [value, setValue] = useState(initialValue);

  const options = useMemo(() => {
    return getAvailableOptions(availableOperators);
  }, [availableOperators]);

  const optionType = useMemo(() => {
    return getOptionType(value);
  }, [value]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onChange(value);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack p="md">
        <Group>
          <Select data={options} value={optionType} />
          {value?.type === "relative" && (
            <SimpleRelativeDatePicker value={value} onChange={setValue} />
          )}
        </Group>
        <Button type="submit" variant="filled" fullWidth>{t`Apply`}</Button>
      </Stack>
    </form>
  );
}
