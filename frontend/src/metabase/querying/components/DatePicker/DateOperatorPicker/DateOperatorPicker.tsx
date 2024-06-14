import { useMemo } from "react";
import { t } from "ttag";

import { Group, Stack, Flex, Switch } from "metabase/ui";

import { SimpleRelativeDatePicker } from "../RelativeDatePicker";
import {
  getIncludeCurrentLabel,
  getIncludeCurrent,
  setIncludeCurrent,
} from "../RelativeDatePicker/DateIntervalPicker/utils";
import { SimpleSpecificDatePicker } from "../SpecificDatePicker";
import type { DatePickerOperator, DatePickerValue } from "../types";

import { FlexSelect } from "./DateOperatorPicker.styled";
import { getAvailableOptions, getOptionType, setOptionType } from "./utils";

interface DateOperatorPickerProps {
  value?: DatePickerValue;
  availableOperators: ReadonlyArray<DatePickerOperator>;
  onChange: (value: DatePickerValue | undefined) => void;
}

export function DateOperatorPicker({
  value,
  availableOperators,
  onChange,
}: DateOperatorPickerProps) {
  const options = useMemo(() => {
    return getAvailableOptions(availableOperators);
  }, [availableOperators]);

  const optionType = useMemo(() => {
    return getOptionType(value);
  }, [value]);

  const handleChange = (inputValue: string | null) => {
    const option = options.find(option => option.value === inputValue);
    if (option) {
      onChange(setOptionType(value, option.value));
    }
  };

  const includeCurrent = value && getIncludeCurrent(value);

  const handleIncludeCurrentSwitch = () => {
    if (!value) {
      return;
    }

    onChange(setIncludeCurrent(value, !includeCurrent));
  };

  return (
    <Stack>
      <Group>
        <FlexSelect data={options} value={optionType} onChange={handleChange} />
        {value?.type === "relative" && (
          <SimpleRelativeDatePicker value={value} onChange={onChange} />
        )}
      </Group>
      {value?.type === "relative" && value?.value !== "current" && (
        <Flex>
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
      )}
      {value?.type === "specific" && (
        <SimpleSpecificDatePicker value={value} onChange={onChange} />
      )}
    </Stack>
  );
}
