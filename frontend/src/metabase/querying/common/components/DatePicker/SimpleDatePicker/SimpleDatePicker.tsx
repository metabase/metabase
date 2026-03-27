import type { FormEvent } from "react";
import { useState } from "react";
import { t } from "ttag";

import { DATE_PICKER_OPERATORS } from "metabase/querying/common/constants";
import type {
  DatePickerOperator,
  DatePickerUnit,
  DatePickerValue,
} from "metabase/querying/common/types";
import { Button, Stack } from "metabase/ui";

import { DateOperatorPicker } from "../DateOperatorPicker";
import { CurrentDatePicker } from "../RelativeDatePicker/CurrentDatePicker";
import { SimpleDateIntervalPicker } from "../RelativeDatePicker/DateIntervalPicker/SimpleDateIntervalPicker";
import { isIntervalValue, isRelativeValue } from "../RelativeDatePicker/utils";
import { SimpleSpecificDatePicker } from "../SpecificDatePicker/SimpleSpecificDatePicker";
import { isSpecificValue } from "../SpecificDatePicker/utils";

interface SimpleDatePickerProps {
  value?: DatePickerValue;
  availableOperators?: DatePickerOperator[];
  availableUnits: DatePickerUnit[];
  onChange: (value: DatePickerValue | undefined) => void;
}

export function SimpleDatePicker({
  value: initialValue,
  availableUnits,
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
          <SimpleDateIntervalPicker
            value={value}
            availableUnits={availableUnits}
            onChange={setValue}
          />
        )}
        {isRelativeValue(value) && !isIntervalValue(value) && (
          <CurrentDatePicker
            value={value}
            availableUnits={availableUnits}
            onChange={setValue}
          />
        )}
        {isSpecificValue(value) && (
          <SimpleSpecificDatePicker value={value} onChange={setValue} />
        )}
        <Button type="submit" variant="filled">{t`Apply`}</Button>
      </Stack>
    </form>
  );
}
