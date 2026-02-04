import type { FormEvent, ReactNode } from "react";
import { t } from "ttag";

import { Box, Button, Divider, Group, Icon, Select, Text } from "metabase/ui";

import type {
  DatePickerUnit,
  RelativeDatePickerValue,
} from "../../../../types";
import { NumberInputWithFallbackValue } from "../../NumberInputWithFallbackValue";
import type { DatePickerSubmitButtonProps } from "../../types";
import { renderDefaultSubmitButton } from "../../utils";
import {
  formatDateRange,
  getInterval,
  getUnitOptions,
  setInterval,
} from "../utils";

import S from "./DateOffsetIntervalPicker.module.css";
import {
  getDirectionText,
  getOffsetInterval,
  getOffsetUnitOptions,
  removeOffset,
  setOffsetInterval,
  setOffsetUnit,
  setUnit,
} from "./utils";

interface DateOffsetIntervalPickerProps {
  value: RelativeDatePickerValue;
  availableUnits: DatePickerUnit[];
  renderSubmitButton?: (props: DatePickerSubmitButtonProps) => ReactNode;
  onChange: (value: RelativeDatePickerValue) => void;
  onSubmit: () => void;
}

export function DateOffsetIntervalPicker({
  value,
  availableUnits,
  renderSubmitButton = renderDefaultSubmitButton,
  onChange,
  onSubmit,
}: DateOffsetIntervalPickerProps) {
  const interval = getInterval(value);
  const unitOptions = getUnitOptions(value, availableUnits);
  const offsetInterval = getOffsetInterval(value);
  const offsetUnitOptions = getOffsetUnitOptions(value, availableUnits);
  const directionText = getDirectionText(value);
  const dateRangeText = formatDateRange(value);

  const handleIntervalChange = (inputValue: number | string) => {
    if (typeof inputValue === "number") {
      onChange(setInterval(value, inputValue));
    }
  };

  const handleUnitChange = (inputValue: string | null) => {
    const option = unitOptions.find(({ value }) => value === inputValue);
    if (option) {
      onChange(setUnit(value, option.value));
    }
  };

  const handleOffsetIntervalChange = (inputValue: number | string) => {
    if (typeof inputValue === "number") {
      onChange(setOffsetInterval(value, inputValue));
    }
  };

  const handleOffsetUnitChange = (inputValue: string | null) => {
    const option = offsetUnitOptions.find(({ value }) => value === inputValue);
    if (option) {
      onChange(setOffsetUnit(value, option.value));
    }
  };

  const handleOffsetRemove = () => {
    onChange(removeOffset(value));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit}>
      <Box className={S.PickerGrid} p="md">
        <Text>{directionText}</Text>
        <NumberInputWithFallbackValue
          value={interval}
          aria-label={t`Interval`}
          w="4rem"
          onChange={handleIntervalChange}
        />
        <Select
          classNames={{
            wrapper: S.selectWrapper,
          }}
          data={unitOptions}
          value={value.unit}
          aria-label={t`Unit`}
          onChange={handleUnitChange}
          comboboxProps={{
            withinPortal: false,
            floatingStrategy: "fixed",
          }}
        />
        <div />
        <Text>{t`Starting from`}</Text>
        <NumberInputWithFallbackValue
          value={offsetInterval}
          aria-label={t`Starting from interval`}
          w="4rem"
          onChange={handleOffsetIntervalChange}
        />
        <Select
          classNames={{
            wrapper: S.selectWrapper,
          }}
          data={offsetUnitOptions}
          value={value.offsetUnit}
          aria-label={t`Starting from unit`}
          onChange={handleOffsetUnitChange}
          comboboxProps={{
            withinPortal: false,
            floatingStrategy: "fixed",
          }}
        />
        <Button
          c="text-secondary"
          variant="subtle"
          leftSection={<Icon name="close" />}
          aria-label={t`Remove offset`}
          onClick={handleOffsetRemove}
        />
      </Box>
      <Divider />
      <Group px="md" py="sm" gap="sm" justify="space-between">
        <Group c="text-secondary" gap="sm">
          <Icon name="calendar" />
          <Text c="inherit">{dateRangeText}</Text>
        </Group>
        {renderSubmitButton({ value })}
      </Group>
    </form>
  );
}
