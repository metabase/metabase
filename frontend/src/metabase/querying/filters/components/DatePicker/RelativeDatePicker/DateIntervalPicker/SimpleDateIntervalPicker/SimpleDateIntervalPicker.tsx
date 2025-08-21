import { useCallback, useState } from "react";
import { t } from "ttag";

import type {
  DatePickerUnit,
  RelativeDatePickerValue,
} from "metabase/querying/filters/types";
import { Group, NumberInput, Select } from "metabase/ui";

import { IncludeCurrentSwitch } from "../../IncludeCurrentSwitch";
import { getInterval, getUnitOptions, setInterval } from "../../utils";
import { setUnit } from "../utils";

interface SimpleDateIntervalPickerProps {
  value: RelativeDatePickerValue;
  availableUnits: DatePickerUnit[];
  onChange: (value: RelativeDatePickerValue) => void;
}

export function SimpleDateIntervalPicker({
  value,
  availableUnits,
  onChange,
}: SimpleDateIntervalPickerProps) {
  const [intervalDisplayValue, setIntervalDisplayValue] = useState<
    string | number
  >(getInterval(value));

  const interval = getInterval(value);
  const unitOptions = getUnitOptions(value, availableUnits);

  const handleIntervalChange = (inputValue: number | string) => {
    setIntervalDisplayValue(inputValue);

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

  // Forces the displayed interval to the current interval when the input loses focus.
  // E.g. user deletes the input value and then clicks outside the input.
  const handleBlur = useCallback(() => {
    setIntervalDisplayValue(interval);
  }, [interval]);

  return (
    <>
      <Group>
        <NumberInput
          allowDecimal={false}
          value={intervalDisplayValue}
          aria-label={t`Interval`}
          w="4rem"
          onChange={handleIntervalChange}
          onBlur={handleBlur}
        />
        <Select
          data={unitOptions}
          value={value.unit}
          aria-label={t`Unit`}
          onChange={handleUnitChange}
          comboboxProps={{
            withinPortal: false,
            floatingStrategy: "fixed",
            position: "top",
          }}
        />
      </Group>
      <IncludeCurrentSwitch value={value} onChange={onChange} />
    </>
  );
}
