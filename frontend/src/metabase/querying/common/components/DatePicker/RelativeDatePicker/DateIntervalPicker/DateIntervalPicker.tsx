import type { FormEvent, ReactNode } from "react";
import { t } from "ttag";

import { NumberInputWithFallbackValue } from "metabase/querying/common/components/DatePicker/NumberInputWithFallbackValue";
import { IncludeCurrentSwitch } from "metabase/querying/common/components/DatePicker/RelativeDatePicker/IncludeCurrentSwitch";
import {
  formatDateRange,
  getInterval,
  getUnitOptions,
  setInterval,
} from "metabase/querying/common/components/DatePicker/RelativeDatePicker/utils";
import type { DatePickerSubmitButtonProps } from "metabase/querying/common/components/DatePicker/types";
import { renderDefaultSubmitButton } from "metabase/querying/common/components/DatePicker/utils";
import type {
  DatePickerUnit,
  RelativeDatePickerValue,
} from "metabase/querying/common/types";
import {
  Button,
  Divider,
  Flex,
  Group,
  Icon,
  Select,
  Text,
  Tooltip,
} from "metabase/ui";

import { setDefaultOffset, setUnit } from "./utils";

interface DateIntervalPickerProps {
  value: RelativeDatePickerValue;
  availableUnits: DatePickerUnit[];
  renderSubmitButton?: (props: DatePickerSubmitButtonProps) => ReactNode;
  onChange: (value: RelativeDatePickerValue) => void;
  onSubmit: () => void;
}

export function DateIntervalPicker({
  value,
  availableUnits,
  renderSubmitButton = renderDefaultSubmitButton,
  onChange,
  onSubmit,
}: DateIntervalPickerProps) {
  const interval = getInterval(value);
  const unitOptions = getUnitOptions(value, availableUnits);
  const dateRangeText = formatDateRange(value);

  const handleIntervalChange = (inputValue: number | string) => {
    if (typeof inputValue === "number") {
      onChange(setInterval(value, inputValue));
    }
  };

  const handleUnitChange = (inputValue: string | null) => {
    const option = unitOptions.find((option) => option.value === inputValue);
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
      <Flex p="md" align="center">
        <NumberInputWithFallbackValue
          allowDecimal={false}
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
          comboboxProps={{
            withinPortal: false,
            floatingStrategy: "fixed",
          }}
        />
        <Tooltip label={t`Starting from…`} position="bottom">
          <Button
            aria-label={t`Starting from…`}
            c="text-secondary"
            variant="subtle"
            leftSection={<Icon name="arrow_left_to_line" />}
            onClick={handleStartingFromClick}
          />
        </Tooltip>
      </Flex>
      <Flex p="md" pt={0}>
        <IncludeCurrentSwitch value={value} onChange={onChange} />
      </Flex>
      <Divider />
      <Group px="md" py="sm" justify="space-between">
        <Group c="text-secondary" gap="sm">
          <Icon name="calendar" />
          <Text c="inherit">{dateRangeText}</Text>
        </Group>
        {renderSubmitButton({ value, isDisabled: false })}
      </Group>
    </form>
  );
}
