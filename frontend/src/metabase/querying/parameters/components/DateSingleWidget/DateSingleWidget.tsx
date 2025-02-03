import dayjs from "dayjs";
import { useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  SingleDatePicker,
  type SingleDatePickerValue,
} from "metabase/querying/filters/components/DatePicker/SpecificDatePicker/SingleDatePicker";
import { serializeDateParameterValue } from "metabase/querying/parameters/utils/dates";
import { normalizeDateParameterValue } from "metabase/querying/parameters/utils/normalize";
import type { ParameterValueOrArray } from "metabase-types/api";

type DateSingleWidgetProps = {
  value: ParameterValueOrArray | null | undefined;
  submitButtonLabel?: string;
  onChange: (value: string) => void;
};

export function DateSingleWidget({
  value,
  submitButtonLabel = t`Apply`,
  onChange,
}: DateSingleWidgetProps) {
  const [pickerValue, setPickerValue] = useState(
    () => getPickerValue(value) ?? getPickerDefaultValue(),
  );

  const handleSubmit = () => {
    onChange(getWidgetValue(pickerValue));
  };

  return (
    <SingleDatePicker
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
): SingleDatePickerValue | undefined {
  return match(normalizeDateParameterValue(value))
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

function getWidgetValue({ date, hasTime }: SingleDatePickerValue) {
  return serializeDateParameterValue({
    type: "specific",
    operator: "=",
    values: [date],
    hasTime: hasTime,
  });
}
