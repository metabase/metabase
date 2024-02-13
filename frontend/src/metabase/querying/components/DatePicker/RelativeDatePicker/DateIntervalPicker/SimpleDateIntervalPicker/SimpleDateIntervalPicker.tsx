import { t } from "ttag";
import { Group, NumberInput, Select } from "metabase/ui";
import type { DateIntervalValue } from "../../types";
import { getInterval, getUnitOptions, setInterval } from "../../utils";
import { setUnit } from "../utils";

interface SimpleDateIntervalPickerProps {
  value: DateIntervalValue;
  onChange: (value: DateIntervalValue) => void;
}

export function SimpleDateIntervalPicker({
  value,
  onChange,
}: SimpleDateIntervalPickerProps) {
  const interval = getInterval(value);
  const unitOptions = getUnitOptions(value);

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
    <Group>
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
        onChange={handleUnitChange}
      />
    </Group>
  );
}
