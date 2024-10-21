import type { FormEvent } from "react";
import { t } from "ttag";

import {
  Button,
  Divider,
  Flex,
  Group,
  Icon,
  NumberInput,
  Select,
  Text,
  Tooltip,
} from "metabase/ui";

import type { DatePickerUnit } from "../../types";
import { IncludeCurrentSwitch } from "../IncludeCurrentSwitch";
import type { DateIntervalValue } from "../types";
import {
  formatDateRange,
  getInterval,
  getUnitOptions,
  setInterval,
} from "../utils";

import { setDefaultOffset, setUnit } from "./utils";

interface DateIntervalPickerProps {
  value: DateIntervalValue;
  availableUnits: ReadonlyArray<DatePickerUnit>;
  isNew: boolean;
  canUseRelativeOffsets: boolean;
  onChange: (value: DateIntervalValue) => void;
  onSubmit: () => void;
}

export function DateIntervalPicker({
  value,
  availableUnits,
  isNew,
  canUseRelativeOffsets,
  onChange,
  onSubmit,
}: DateIntervalPickerProps) {
  const interval = getInterval(value);
  const unitOptions = getUnitOptions(value, availableUnits);
  const dateRangeText = formatDateRange(value);

  const handleIntervalChange = (inputValue: number | "") => {
    if (inputValue !== "") {
      onChange(setInterval(value, inputValue));
    }
  };

  const handleUnitChange = (inputValue: string | null) => {
    const option = unitOptions.find(option => option.value === inputValue);
    if (option) {
      onChange(setUnit(value, option.value));
    }
  };

  const handleStartingFromClick = () => {
    onChange(setDefaultOffset(value));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Flex p="md">
        <NumberInput
          value={interval}
          aria-label={t`Interval`}
          w="4rem"
          onChange={handleIntervalChange}
        />
        <Select
          data={unitOptions}
          value={value.unit}
          aria-label={t`Unit`}
          ml="md"
          onChange={handleUnitChange}
        />
        {canUseRelativeOffsets && (
          <Tooltip label={t`Starting from…`} position="bottom">
            <Button
              aria-label={t`Starting from…`}
              c="text-medium"
              variant="subtle"
              leftIcon={<Icon name="arrow_left_to_line" />}
              onClick={handleStartingFromClick}
            />
          </Tooltip>
        )}
      </Flex>
      <Flex p="md" pt={0}>
        <IncludeCurrentSwitch value={value} onChange={onChange} />
      </Flex>
      <Divider />
      <Group px="md" py="sm" position="apart">
        <Group c="text-medium" spacing="sm">
          <Icon name="calendar" />
          <Text c="inherit">{dateRangeText}</Text>
        </Group>
        <Button variant="filled" type="submit">
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </form>
  );
}
