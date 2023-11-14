import { useState } from "react";
import type { FormEvent } from "react";
import { t } from "ttag";
import type { DateValue } from "metabase/ui";
import {
  Button,
  DateInput,
  DatePicker,
  Divider,
  Group,
  Stack,
  TimeInput,
} from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import {
  clearTimePart,
  hasTimeParts,
  setDatePart,
  setTimePart,
} from "../utils";

interface SingleDatePickerProps {
  value: Date;
  isNew: boolean;
  onChange: (value: Date) => void;
  onSubmit: () => void;
}

export function SingleDatePicker({
  value,
  isNew,
  onChange,
  onSubmit,
}: SingleDatePickerProps) {
  const [date, setDate] = useState<Date>(value);
  const [hasTime, setHasTime] = useState(hasTimeParts(value));

  const handleDateChange = (newDate: DateValue) => {
    newDate && onChange(setDatePart(value, newDate));
  };

  const handleTimeChange = (newTime: Date) => {
    onChange(setTimePart(value, newTime));
  };

  const handleTimeToggle = () => {
    setHasTime(!hasTime);
    onChange(clearTimePart(value));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack p="md">
        <DateInput
          value={value}
          date={date}
          popoverProps={{ opened: false }}
          aria-label={t`Date`}
          onChange={handleDateChange}
          onDateChange={setDate}
        />
        {hasTime && (
          <TimeInput
            value={value}
            aria-label={t`Time`}
            onChange={handleTimeChange}
          />
        )}
        <Stack align="center">
          <DatePicker
            value={value}
            date={date}
            onChange={handleDateChange}
            onDateChange={setDate}
          />
        </Stack>
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
        <Button variant="filled" type="submit">
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </form>
  );
}
