import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { Button, Divider, Group, NumberInput, Select, Text } from "metabase/ui";
import type { DateIntervalValue, DateOffsetIntervalValue } from "../types";
import { getInterval, getUnitOptions, setInterval } from "../utils";
import {
  getDirectionText,
  getOffsetInterval,
  getOffsetUnitOptions,
  removeOffset,
  setOffsetInterval,
  setOffsetUnit,
  setUnit,
} from "./utils";
import { PickerGrid } from "./DateOffsetIntervalPicker.styled";

interface DateOffsetIntervalPickerProps {
  value: DateOffsetIntervalValue;
  isNew: boolean;
  onChange: (value: DateIntervalValue) => void;
  onSubmit: () => void;
}

export function DateOffsetIntervalPicker({
  value,
  isNew,
  onChange,
  onSubmit,
}: DateOffsetIntervalPickerProps) {
  const interval = getInterval(value);
  const unitOptions = getUnitOptions(value);
  const offsetInterval = getOffsetInterval(value);
  const offsetUnitOptions = getOffsetUnitOptions(value);
  const directionText = getDirectionText(value);

  const handleIntervalChange = (inputValue: number | "") => {
    if (inputValue !== "") {
      onChange(setInterval(value, inputValue));
    }
  };

  const handleUnitChange = (inputValue: string | null) => {
    const option = unitOptions.find(({ value }) => value === inputValue);
    if (option) {
      onChange(setUnit(value, option.value));
    }
  };

  const handleOffsetIntervalChange = (inputValue: number | "") => {
    if (inputValue !== "") {
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

  return (
    <div>
      <PickerGrid p="md">
        <Text>{directionText}</Text>
        <NumberInput
          value={interval}
          w="4rem"
          onChange={handleIntervalChange}
        />
        <Select
          data={unitOptions}
          value={value.unit}
          withinPortal={false}
          onChange={handleUnitChange}
        />
        <div />
        <Text>{t`Starting from`}</Text>
        <NumberInput
          value={offsetInterval}
          w="4rem"
          onChange={handleOffsetIntervalChange}
        />
        <Select
          data={offsetUnitOptions}
          value={value.offsetUnit}
          withinPortal={false}
          onChange={handleOffsetUnitChange}
        />
        <Button
          variant="subtle"
          leftIcon={<Icon name="close" />}
          aria-label={t`Remove offset`}
          onClick={handleOffsetRemove}
        />
      </PickerGrid>
      <Divider />
      <Group p="sm" position="right">
        <Button variant="filled" onClick={onSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </div>
  );
}
