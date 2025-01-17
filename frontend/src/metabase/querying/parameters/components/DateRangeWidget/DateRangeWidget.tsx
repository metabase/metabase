import dayjs from "dayjs";
import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  DateRangePicker,
  type DateRangePickerValue,
} from "metabase/querying/filters/components/DatePicker/SpecificDatePicker/DateRangePicker";
import { serializeDateParameterValue } from "metabase/querying/parameters/utils/dates";
import { normalizeDateParameterValue } from "metabase/querying/parameters/utils/normalize";
import type { ParameterValueOrArray } from "metabase-types/api";

type DateRangeWidgetProps = {
  value: ParameterValueOrArray | null | undefined;
  submitButtonLabel?: string;
  onChange: (value: string) => void;
};

export function DateRangeWidget({
  value,
  submitButtonLabel = t`Apply`,
  onChange,
}: DateRangeWidgetProps) {
  const [pickerValue, setPickerValue] = useState(
    () => getPickerValue(value) ?? getPickerDefaultValue(),
  );

  const handleSubmit = () => {
    onChange(getWidgetValue(pickerValue));
  };

  return (
    <DateRangePicker
      value={pickerValue}
      submitButtonLabel={submitButtonLabel}
      hasTimeToggle
      onChange={setPickerValue}
      onSubmit={handleSubmit}
    />
  );
}

function getPickerValue(
  value: ParameterValueOrArray | null | undefined,
): DateRangePickerValue | undefined {
  return match(normalizeDateParameterValue(value))
    .returnType<DateRangePickerValue | undefined>()
    .with({ type: "specific", operator: "between" }, ({ values, hasTime }) => ({
      dateRange: [values[0], values[1]],
      hasTime,
    }))
    .otherwise(() => undefined);
}

function getPickerDefaultValue(): DateRangePickerValue {
  const today = dayjs().startOf("date").toDate();
  const past30Days = dayjs(today).subtract(30, "day").toDate();
  return { dateRange: [past30Days, today], hasTime: false };
}

function getWidgetValue({ dateRange, hasTime }: DateRangePickerValue) {
  return serializeDateParameterValue({
    type: "specific",
    operator: "between",
    values: dateRange,
    hasTime,
  });
}
