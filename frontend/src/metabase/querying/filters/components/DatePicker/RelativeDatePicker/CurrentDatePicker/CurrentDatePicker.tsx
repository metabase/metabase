import { t } from "ttag";

import { Button, Group, Stack, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

import type {
  DatePickerTruncationUnit,
  DatePickerUnit,
  RelativeDatePickerValue,
} from "../../types";
import { formatDateRange } from "../utils";

import { getCurrentValue, getUnitGroups } from "./utils";

interface CurrentDatePickerProps {
  value: RelativeDatePickerValue | undefined;
  availableUnits: ReadonlyArray<DatePickerUnit>;
  onChange: (value: RelativeDatePickerValue) => void;
}

export function CurrentDatePicker({
  value,
  availableUnits,
  onChange,
}: CurrentDatePickerProps) {
  const unitGroups = getUnitGroups(availableUnits);

  const getTooltipLabel = (unit: DatePickerTruncationUnit) => {
    return formatDateRange(getCurrentValue(unit));
  };

  const handleClick = (unit: DatePickerTruncationUnit) => {
    onChange(getCurrentValue(unit));
  };

  return (
    <Stack>
      {unitGroups.map((group, groupIndex) => (
        <Group key={groupIndex}>
          {group.map(unit => (
            <Tooltip
              key={unit}
              label={t`Right now, this is ${getTooltipLabel(unit)}`}
            >
              <Button
                variant={unit === value?.unit ? "filled" : "default"}
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
