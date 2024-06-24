import type { FormEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import { Button, Stack } from "metabase/ui";

import { DateOperatorPicker } from "../DateOperatorPicker";
import { CurrentDatePicker } from "../RelativeDatePicker/CurrentDatePicker";
import { SimpleDateIntervalPicker } from "../RelativeDatePicker/DateIntervalPicker";
import { isIntervalValue, isRelativeValue } from "../RelativeDatePicker/utils";
import { SimpleSpecificDatePicker } from "../SpecificDatePicker";
import { isSpecificValue } from "../SpecificDatePicker/utils";
import { DATE_PICKER_OPERATORS } from "../constants";
import type { DatePickerOperator, DatePickerValue } from "../types";

interface SimpleDatePickerProps {
  value?: DatePickerValue;
  availableOperators?: ReadonlyArray<DatePickerOperator>;
  onChange: (value: DatePickerValue | undefined) => void;
}

export function SimpleDatePicker({
  value: initialValue,
  availableOperators = DATE_PICKER_OPERATORS,
  onChange,
}: SimpleDatePickerProps) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onChange(value);
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack p="md">
        <DateOperatorPicker
          value={value}
          availableOperators={availableOperators}
          onChange={setValue}
        />
        {isRelativeValue(value) && isIntervalValue(value) && (
          <SimpleDateIntervalPicker value={value} onChange={setValue} />
        )}
        {isRelativeValue(value) && !isIntervalValue(value) && (
          <CurrentDatePicker value={value} onChange={setValue} />
        )}
        {isSpecificValue(value) && (
          <SimpleSpecificDatePicker value={value} onChange={setValue} />
        )}
        <Button type="submit" variant="filled">{t`Apply`}</Button>
      </Stack>
    </form>
  );
}
