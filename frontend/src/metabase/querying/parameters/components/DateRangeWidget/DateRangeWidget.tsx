import dayjs from "dayjs";
import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  DateRangePicker,
  type DateRangePickerValue,
} from "metabase/querying/filters/components/DatePicker/SpecificDatePicker/DateRangePicker";
import {
  deserializeDateFilter,
  serializeDateFilter,
} from "metabase/querying/parameters/utils/dates";

type DateRangeWidgetProps = {
  value: string | undefined;
  submitButtonLabel?: string;
  onChange: (value: string) => void;
};

export function DateRangeWidget({
  value: valueText,
  submitButtonLabel = t`Apply`,
  onChange,
}: DateRangeWidgetProps) {
  const [value, setValue] = useState(
    () => getPickerValue(valueText) ?? getPickerDefaultValue(),
  );

  const handleSubmit = () => {
    onChange(getWidgetValue(value));
  };

  return (
    <DateRangePicker
      value={value}
      submitButtonLabel={submitButtonLabel}
      hasTimeToggle
      onChange={setValue}
      onSubmit={handleSubmit}
    />
  );
}

function getPickerValue(
  valueText: string | undefined,
): DateRangePickerValue | undefined {
  const value =
    valueText != null ? deserializeDateFilter(valueText) : undefined;
  return match(value)
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

function getWidgetValue(value: DateRangePickerValue) {
  return serializeDateFilter({
    type: "specific",
    operator: "between",
    values: value.dateRange,
    hasTime: value.hasTime,
  });
}
