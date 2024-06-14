import type { FormEvent } from "react";
import { t } from "ttag";

import {
  Icon,
  Button,
  Divider,
  Flex,
  Group,
  Menu,
  NumberInput,
  Select,
  Text,
  Switch,
} from "metabase/ui";

import type { DateIntervalValue } from "../types";
import {
  formatDateRange,
  getInterval,
  setInterval,
  getUnitOptions,
} from "../utils";

import {
  getIncludeCurrentLabel,
  getIncludeCurrent,
  setIncludeCurrent,
  setUnit,
  setDefaultOffset,
} from "./utils";

interface DateIntervalPickerProps {
  value: DateIntervalValue;
  isNew: boolean;
  canUseRelativeOffsets: boolean;
  onChange: (value: DateIntervalValue) => void;
  onSubmit: () => void;
}

export function DateIntervalPicker({
  value,
  isNew,
  canUseRelativeOffsets,
  onChange,
  onSubmit,
}: DateIntervalPickerProps) {
  const interval = getInterval(value);
  const unitOptions = getUnitOptions(value);
  const includeCurrent = getIncludeCurrent(value);
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

  const handleIncludeCurrentSwitch = () => {
    onChange(setIncludeCurrent(value, !includeCurrent));
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
        <Menu>
          <Menu.Target>
            <Button
              c="text-dark"
              variant="subtle"
              leftIcon={<Icon name="ellipsis" />}
              aria-label={t`Options`}
            />
          </Menu.Target>
          <Menu.Dropdown>
            {canUseRelativeOffsets && (
              <Menu.Item
                icon={<Icon name="arrow_left_to_line" />}
                onClick={handleStartingFromClick}
              >
                {t`Starting from…`}
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </Flex>
      <Flex p="md" pt={0}>
        <Switch
          aria-checked={includeCurrent}
          checked={includeCurrent}
          data-testid="include-current-interval-option"
          label={t`Include ${getIncludeCurrentLabel(value.unit)}`}
          labelPosition="right"
          onChange={handleIncludeCurrentSwitch}
          size="sm"
        />
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
