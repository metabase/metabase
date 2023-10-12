import { useState } from "react";
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
  value: initialValue,
  isNew,
  onChange,
  onSubmit,
}: SingleDatePickerProps) {
  const [value, setValue] = useState<Date>(initialValue);
  const [openedDate, setOpenedDate] = useState<Date>(initialValue);
  const [hasTime, setHasTime] = useState(hasTimeParts(initialValue));
  const isValid = value != null;

  const handleDateChange = (newDate: DateValue) => {
    if (newDate) {
      const newValue = setDatePart(value, newDate);
      setValue(newValue);
      onChange(newValue);
    }
  };

  const handleTimeChange = (newTime: Date) => {
    handleDateChange(setTimePart(value, newTime));
  };

  const handleTimeToggle = () => {
    setHasTime(!hasTime);
    handleDateChange(clearTimePart(value));
  };

  return (
    <div>
      <Stack p="md">
        <DateInput
          value={value}
          date={openedDate}
          popoverProps={{ opened: false }}
          onChange={handleDateChange}
          onDateChange={setOpenedDate}
        />
        {hasTime && <TimeInput value={value} onChange={handleTimeChange} />}
        <Stack align="center">
          <DatePicker
            value={value}
            date={openedDate}
            onChange={handleDateChange}
            onDateChange={setOpenedDate}
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
        <Button variant="filled" disabled={!isValid} onClick={onSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </div>
  );
}
