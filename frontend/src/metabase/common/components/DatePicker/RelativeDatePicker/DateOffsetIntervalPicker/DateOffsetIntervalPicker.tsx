import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { Button, Group, NumberInput, Select, Text } from "metabase/ui";
import type { DateIntervalValue, DateOffsetIntervalValue } from "../types";
import { getInterval, getUnitOptions, setInterval } from "../utils";
import { setUnit } from "./utils";
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
  const unitOptions = getUnitOptions(interval);

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

  return (
    <div>
      <PickerGrid p="md">
        <Text>{t`Past`}</Text>
        <NumberInput value={interval} onChange={handleIntervalChange} />
        <Select
          data={unitOptions}
          value={value.unit}
          withinPortal={false}
          onChange={handleUnitChange}
        />
        <div />
        <Text>{t`Starting from`}</Text>
        <NumberInput />
        <Select data={[]} withinPortal={false} />
        <Button variant="subtle" leftIcon={<Icon name="close" />} />
      </PickerGrid>
      <Group p="sm" position="right">
        <Button variant="filled" onClick={onSubmit}>
          {isNew ? t`Add filter` : t`Update filter`}
        </Button>
      </Group>
    </div>
  );
}
