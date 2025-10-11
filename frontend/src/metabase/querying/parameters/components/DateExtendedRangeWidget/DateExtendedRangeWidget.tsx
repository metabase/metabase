import dayjs from "dayjs";
import { useState } from "react";
import { match } from "ts-pattern";

import { ExtendedDateFilterPicker } from "metabase/querying/filters/components/DatePicker/ExtendedDateFilterPicker";
import type { SpecificDatePickerValue } from "metabase/querying/filters/types";
import {
  deserializeDateParameterValue,
  serializeDateParameterValue,
} from "metabase/querying/parameters/utils/parsing";
import type { ParameterValueOrArray } from "metabase-types/api";

type DateExtendedRangeWidgetProps = {
  value: ParameterValueOrArray | null | undefined;
  onChange: (value: string) => void;
};

export function DateExtendedRangeWidget({
  value,
  onChange,
}: DateExtendedRangeWidgetProps) {
  const [pickerValue, setPickerValue] = useState(
    () => getPickerValue(value) ?? getPickerDefaultValue(),
  );

  const handleChange = (value: SpecificDatePickerValue) => {
    // Only update internal state, don't call onChange yet
    setPickerValue(value);
  };

  const handleApply = (value: SpecificDatePickerValue) => {
    // This is called when user actually wants to apply the filter
    setPickerValue(value);
    onChange(getWidgetValue(value));
  };

  return (
    <ExtendedDateFilterPicker
      value={pickerValue}
      onChange={handleChange}
      onApply={handleApply}
      onBack={() => {}}
      readOnly={false}
    />
  );
}

function getPickerValue(
  value: ParameterValueOrArray | null | undefined,
): SpecificDatePickerValue | undefined {
  return match(deserializeDateParameterValue(value))
    .returnType<SpecificDatePickerValue | undefined>()
    .with(
      { type: "specific", operator: "between" },
      (specificValue) => specificValue,
    )
    .otherwise(() => undefined);
}

function getPickerDefaultValue(): SpecificDatePickerValue {
  const today = dayjs().startOf("date").toDate();
  const past30Days = dayjs(today).subtract(30, "day").toDate();
  return {
    type: "specific",
    operator: "between",
    values: [past30Days, today],
    hasTime: false,
  };
}

function getWidgetValue(value: SpecificDatePickerValue) {
  return serializeDateParameterValue(value);
}
