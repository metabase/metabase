import { Button, Group, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "../../types";
import { UNIT_GROUPS } from "./constants";

interface CurrentDatePickerProps {
  value: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
}

export function CurrentDatePicker({ value, onChange }: CurrentDatePickerProps) {
  const handleClick = (unit: DatePickerTruncationUnit) => {
    onChange({ ...value, unit });
  };

  return (
    <Stack p="md">
      {UNIT_GROUPS.map((group, groupIndex) => (
        <Group key={groupIndex}>
          {group.map(unit => (
            <Button
              key={unit}
              variant={unit === value.unit ? "filled" : "default"}
              radius="xl"
              onClick={() => handleClick(unit)}
            >
              {Lib.describeTemporalUnit(unit)}
            </Button>
          ))}
        </Group>
      ))}
    </Stack>
  );
}
