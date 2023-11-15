import { useState } from "react";
import type { FormEvent } from "react";
import { t } from "ttag";
import {
  Box,
  Button,
  DateInput,
  DatePicker,
  Divider,
  Group,
  Stack,
  TimeInput,
} from "metabase/ui";
import type { ButtonProps, DateValue } from "metabase/ui";
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
  const [hasTime, setHasTime] = useState(hasTimeParts(value));

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
      <Box p="md">
        <DatePickerBody value={value} hasTime={hasTime} onChange={onChange} />
      </Box>
      <Divider />
      <Group p="sm" position="apart">
        <DatePickerToggle hasTime={hasTime} onClick={handleTimeToggle} />
        <Button variant="filled" type="submit">
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </form>
  );
}

interface SimpleSingleDatePickerProps {
  value: Date;
  onChange: (value: Date) => void;
}

export function SimpleSingleDatePicker({
  value,
  onChange,
}: SimpleSingleDatePickerProps) {
  const [hasTime, setHasTime] = useState(hasTimeParts(value));

  const handleTimeToggle = () => {
    setHasTime(!hasTime);
    onChange(clearTimePart(value));
  };

  return (
    <Stack>
      <DatePickerBody value={value} hasTime={hasTime} onChange={onChange} />
      <Box>
        <DatePickerToggle pl={0} hasTime={hasTime} onClick={handleTimeToggle} />
      </Box>
    </Stack>
  );
}

interface DatePickerBodyProps {
  value: Date;
  hasTime: boolean;
  onChange: (value: Date) => void;
}

function DatePickerBody({ value, hasTime, onChange }: DatePickerBodyProps) {
  const [date, setDate] = useState<Date>(value);

  const handleDateChange = (newDate: DateValue) => {
    newDate && onChange(setDatePart(value, newDate));
  };

  const handleTimeChange = (newTime: Date) => {
    onChange(setTimePart(value, newTime));
  };

  return (
    <Stack>
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
      <DatePicker
        value={value}
        date={date}
        onChange={handleDateChange}
        onDateChange={setDate}
      />
    </Stack>
  );
}

interface DatePickerToggleProps extends ButtonProps {
  hasTime: boolean;
  onClick?: () => void;
}

function DatePickerToggle({ hasTime, ...props }: DatePickerToggleProps) {
  return (
    <Button
      c="text.1"
      variant="subtle"
      leftIcon={<Icon name="clock" />}
      {...props}
    >
      {hasTime ? t`Remove time` : t`Add time`}
    </Button>
  );
}
