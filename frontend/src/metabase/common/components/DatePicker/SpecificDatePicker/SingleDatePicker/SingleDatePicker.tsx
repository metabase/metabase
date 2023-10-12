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
  const [openedDate, setOpenedDate] = useState<Date>(initialValue);
  const isValid = value != null;

  const handleChange = (newDate: DateValue) => {
    setValue(newDate);
    if (newDate != null) {
      onChange(newDate);
    }
  };

  return (
    <div>
      <Stack p="md" align="center">
        <DateInput
          value={value}
          date={openedDate}
          popoverProps={{ opened: false }}
          w="100%"
          onChange={handleChange}
          onDateChange={setOpenedDate}
        />
        <DatePicker
          value={value}
          date={openedDate}
          onChange={handleChange}
          onDateChange={setOpenedDate}
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
