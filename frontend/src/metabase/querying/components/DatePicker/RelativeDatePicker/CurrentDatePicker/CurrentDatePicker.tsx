import { t } from "ttag";
import { Button, Group, Stack, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type {
  DatePickerTruncationUnit,
  RelativeDatePickerValue,
} from "../../types";
import { formatDateRange } from "../utils";
import { UNIT_GROUPS } from "./constants";

interface CurrentDatePickerProps {
  value: RelativeDatePickerValue;
  onChange: (value: RelativeDatePickerValue) => void;
}

export function CurrentDatePicker({ value, onChange }: CurrentDatePickerProps) {
  const getTooltipLabel = (unit: DatePickerTruncationUnit) => {
    return formatDateRange({ ...value, unit });
  };

  const handleClick = (unit: DatePickerTruncationUnit) => {
    onChange({ ...value, unit });
  };

  return (
    <Stack p="md">
      {UNIT_GROUPS.map((group, groupIndex) => (
        <Group key={groupIndex}>
          {group.map(unit => (
            <Tooltip
              key={unit}
              label={t`Right now, this is ${getTooltipLabel(unit)}`}
            >
              <Button
                variant={unit === value.unit ? "filled" : "default"}
                radius="xl"
                onClick={() => handleClick(unit)}
              >
                {Lib.describeTemporalUnit(unit)}
              </Button>
            </Tooltip>
          ))}
        </Group>
      ))}
    </Stack>
  );
}
