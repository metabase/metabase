import { t } from "ttag";

import { NumberInputWithFallbackValue } from "metabase/querying/common/components/DatePicker/NumberInputWithFallbackValue";
import { setUnit } from "metabase/querying/common/components/DatePicker/RelativeDatePicker/DateIntervalPicker/utils";
import { IncludeCurrentSwitch } from "metabase/querying/common/components/DatePicker/RelativeDatePicker/IncludeCurrentSwitch";
import {
  getInterval,
  getUnitOptions,
  setInterval,
} from "metabase/querying/common/components/DatePicker/RelativeDatePicker/utils";
import type {
  DatePickerUnit,
  RelativeDatePickerValue,
} from "metabase/querying/common/types";
import { Group, Select } from "metabase/ui";

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
  const interval = getInterval(value);
  const unitOptions = getUnitOptions(value, availableUnits);

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

  return (
    <>
      <Group>
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
