import { useMemo } from "react";
import { t } from "ttag";

import { Group, Stack, Flex, Switch } from "metabase/ui";

import { SimpleRelativeDatePicker } from "../RelativeDatePicker";
import {
  getIncludeCurrentLabel,
  getIncludeCurrent,
  setIncludeCurrent,
} from "../RelativeDatePicker/DateIntervalPicker/utils";
import type { DateIntervalValue } from "../RelativeDatePicker/types";
import { isIntervalValue, isRelativeValue } from "../RelativeDatePicker/utils";
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

  const IncludeCurrentSwitch = ({ value }: { value: DateIntervalValue }) => {
    const includeCurrent = getIncludeCurrent(value);

    const handleIncludeCurrentSwitch = () => {
      onChange(setIncludeCurrent(value, !includeCurrent));
    };

    return (
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
    );
  };

  return (
    <Stack>
      <Group>
        <FlexSelect data={options} value={optionType} onChange={handleChange} />
        {value && isRelativeValue(value) && (
          <SimpleRelativeDatePicker value={value} onChange={onChange} />
        )}
      </Group>
      {value && isRelativeValue(value) && isIntervalValue(value) && (
        <IncludeCurrentSwitch value={value} />
      )}
      {value?.type === "specific" && (
        <SimpleSpecificDatePicker value={value} onChange={onChange} />
      )}
    </Stack>
  );
}
