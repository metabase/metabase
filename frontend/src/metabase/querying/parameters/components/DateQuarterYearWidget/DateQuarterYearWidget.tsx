import { useMemo } from "react";
import { match } from "ts-pattern";

import { QuarterYearPicker } from "metabase/querying/filters/components/QuarterYearPicker";
import type { QuarterYearPickerValue } from "metabase/querying/filters/types";
import {
  deserializeDateFilter,
  serializeDateFilter,
} from "metabase/querying/parameters/utils/dates";

type DateQuarterYearPickerProps = {
  value: string | undefined;
  onChange: (value: string) => void;
};

export function DateQuarterYearWidget({
  value: valueText,
  onChange,
}: DateQuarterYearPickerProps) {
  const value = useMemo(() => getPickerValue(valueText), [valueText]);

  const handleChange = (value: QuarterYearPickerValue) => {
    onChange(serializeDateFilter(value));
  };

  return <QuarterYearPicker value={value} onChange={handleChange} />;
}

function getPickerValue(
  valueText: string | undefined,
): QuarterYearPickerValue | undefined {
  const value =
    valueText != null ? deserializeDateFilter(valueText) : undefined;
  return match(value)
    .returnType<QuarterYearPickerValue | undefined>()
    .with({ type: "quarter" }, value => value)
    .otherwise(() => undefined);
}
