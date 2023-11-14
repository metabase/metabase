import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { t } from "ttag";
import type {
  DatePickerOperator,
  DatePickerValue,
} from "metabase/common/components/DatePicker";
import { Button, Stack, Select } from "metabase/ui";
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
  const [value] = useState(initialValue);

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
        <Select data={options} value={optionType} />
        <Button type="submit" variant="filled" fullWidth>{t`Apply`}</Button>
      </Stack>
    </form>
  );
}
