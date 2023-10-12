import { useState } from "react";
import { t } from "ttag";
import {
  Button,
  DateInput,
  DatePicker,
  Divider,
  Group,
  Stack,
} from "metabase/ui";
import type { DateValue } from "metabase/ui";

interface SingleDatePickerProps {
  value: Date;
  isNew: boolean;
  onChange: (value: Date) => void;
  onSubmit: () => void;
}

export function SingleDatePicker({
  value: initialValue,
  isNew,
  onChange,
  onSubmit,
}: SingleDatePickerProps) {
  const [value, setValue] = useState<DateValue>(initialValue);
  const [date, setDate] = useState<Date>(initialValue);
  const isValid = value != null;

  const handleChange = (value: DateValue) => {
    setValue(value);

    if (value) {
      onChange(value);
    }
  };

  return (
    <div>
      <Stack p="md">
        <DateInput
          value={value}
          date={date}
          popoverProps={{ opened: false }}
          onChange={handleChange}
          onDateChange={setDate}
        />
        <DatePicker
          value={value}
          date={date}
          onChange={handleChange}
          onDateChange={setDate}
        />
      </Stack>
      <Divider />
      <Group p="sm" position="right">
        <Button variant="filled" disabled={!isValid} onClick={onSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </div>
  );
}
