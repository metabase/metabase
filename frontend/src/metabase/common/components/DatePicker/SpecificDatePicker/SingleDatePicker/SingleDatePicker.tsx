import { useState } from "react";
import { t } from "ttag";
import {
  Button,
  DateInput,
  DatePicker,
  Divider,
  Group,
  Stack,
  TimeInput,
} from "metabase/ui";
import type { DateValue } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { hasTimeParts, setTime } from "./utils";

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
  const [hasTime, setHasTime] = useState(hasTimeParts(initialValue));
  const isValid = value != null;

  const handleDateChange = (newDate: DateValue) => {
    setValue(newDate);
    newDate && onChange(newDate);
  };

  const handleTimeChange = (newTime: Date) => {
    onChange(setTime(value ?? initialValue, newTime));
  };

  const handleTimeToggle = () => {
    setHasTime(!hasTime);
  };

  return (
    <div>
      <Stack p="md" align="center">
        <DateInput
          value={value}
          date={openedDate}
          popoverProps={{ opened: false }}
          w="100%"
          onChange={handleDateChange}
          onDateChange={setOpenedDate}
        />
        {hasTime && (
          <TimeInput value={value} w="100%" onChange={handleTimeChange} />
        )}
        <DatePicker
          value={value}
          date={openedDate}
          onChange={handleDateChange}
          onDateChange={setOpenedDate}
        />
      </Stack>
      <Divider />
      <Group p="sm" position="apart">
        <Button
          c="text.1"
          variant="subtle"
          leftIcon={<Icon name="clock" />}
          onClick={handleTimeToggle}
        >
          {hasTime ? t`Remove time` : t`Add time`}
        </Button>
        <Button variant="filled" disabled={!isValid} onClick={onSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </div>
  );
}
