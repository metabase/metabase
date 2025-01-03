import dayjs from "dayjs";
import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  SingleDatePicker,
  type SingleDatePickerValue,
} from "metabase/querying/filters/components/DatePicker/SpecificDatePicker/SingleDatePicker";
import {
  deserializeDateFilter,
  serializeDateFilter,
} from "metabase/querying/parameters/utils/dates";

type DateSingleWidgetProps = {
  value: string | undefined;
  submitButtonLabel?: string;
  onChange: (value: string) => void;
};

export function DateSingleWidget({
  value: valueText,
  submitButtonLabel = t`Apply`,
  onChange,
}: DateSingleWidgetProps) {
  const [value, setValue] = useState(
    () => getPickerValue(valueText) ?? getPickerDefaultValue(),
  );

  const handleSubmit = () => {
    onChange(getWidgetValue(value));
  };

  return (
    <SingleDatePicker
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
): SingleDatePickerValue | undefined {
  const value =
    valueText != null ? deserializeDateFilter(valueText) : undefined;
  return match(value)
    .returnType<SingleDatePickerValue | undefined>()
    .with({ type: "specific", operator: "=" }, ({ values, hasTime }) => ({
      date: values[0],
      hasTime,
    }))
    .otherwise(() => undefined);
}

function getPickerDefaultValue(): SingleDatePickerValue {
  const today = dayjs().startOf("date").toDate();
  return { date: today, hasTime: false };
}

function getWidgetValue(value: SingleDatePickerValue) {
  return serializeDateFilter({
    type: "specific",
    operator: "=",
    values: [value.date],
    hasTime: value.hasTime,
  });
}
