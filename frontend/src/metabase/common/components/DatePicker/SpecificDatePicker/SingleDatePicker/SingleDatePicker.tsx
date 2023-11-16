import type { FormEvent } from "react";
import { useState } from "react";
import { t } from "ttag";
import { Box, Button, Divider, Group } from "metabase/ui";
import { TimeToggle } from "../TimeToggle";
import { clearTimePart, hasTimeParts } from "../utils";
import { SingleDatePickerBody } from "./SingleDatePickerBody";

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
        <SingleDatePickerBody
          value={value}
          hasTime={hasTime}
          onChange={onChange}
        />
      </Box>
      <Divider />
      <Group p="sm" position="apart">
        <TimeToggle hasTime={hasTime} onClick={handleTimeToggle} />
        <Button variant="filled" type="submit">
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </form>
  );
}
