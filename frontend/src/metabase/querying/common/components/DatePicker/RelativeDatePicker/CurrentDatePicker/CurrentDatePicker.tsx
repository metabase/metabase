import type { KeyboardEvent } from "react";
import { t } from "ttag";

import type {
  DatePickerTruncationUnit,
  DatePickerUnit,
  RelativeDatePickerValue,
} from "metabase/querying/common/types";
import { Box, Chip, Group, Stack, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";

import { useTimeConfig } from "../use-time-config";
import { formatDateRange } from "../utils";

import { getCurrentValue, getUnitGroups } from "./utils";

interface CurrentDatePickerProps {
  value: RelativeDatePickerValue | undefined;
  availableUnits: DatePickerUnit[];
  onChange: (value: RelativeDatePickerValue) => void;
}

export function CurrentDatePicker({
  value,
  availableUnits,
  onChange,
}: CurrentDatePickerProps) {
  const timeConfig = useTimeConfig();
  const unitGroups = getUnitGroups(availableUnits);

  const getTooltipLabel = (unit: DatePickerTruncationUnit) => {
    return formatDateRange(timeConfig, getCurrentValue(unit));
  };

  const handleClick = (unit: DatePickerTruncationUnit) => {
    onChange(getCurrentValue(unit));
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    unit: DatePickerTruncationUnit,
  ) => {
    const isActivationKey =
      event.key === "Enter" ||
      (event.key === " " && event.currentTarget.checked);
    if (isActivationKey) {
      event.preventDefault();
      handleClick(unit);
    }
  };

  return (
    <Stack role="radiogroup" aria-label={t`Current`}>
      {unitGroups.map((group, groupIndex) => (
        <Group key={groupIndex}>
          {group.map((unit) => (
            <Tooltip
              key={unit}
              label={t`Right now, this is ${getTooltipLabel(unit)}`}
            >
              {/* Chip forwards refs and handlers to its hidden input, so the
                  tooltip needs a visible element to attach to */}
              <Box>
                <Chip
                  type="radio"
                  variant="filled"
                  icon={null}
                  checked={unit === value?.unit}
                  // onClick rather than onChange: re-selecting the current
                  // unit must still submit, and radios don't fire change then
                  onClick={() => handleClick(unit)}
                  onKeyDown={(event) => handleKeyDown(event, unit)}
                >
                  {Lib.describeTemporalUnit(unit)}
                </Chip>
              </Box>
            </Tooltip>
          ))}
        </Group>
      ))}
    </Stack>
  );
}
