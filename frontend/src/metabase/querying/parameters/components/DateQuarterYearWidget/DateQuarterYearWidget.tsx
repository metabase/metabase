import { useMemo } from "react";
import { match } from "ts-pattern";

import { QuarterYearPicker } from "metabase/querying/common/components/QuarterYearPicker";
import type { QuarterYearPickerValue } from "metabase/querying/common/types";
import {
  deserializeDateParameterValue,
  serializeDateParameterValue,
} from "metabase/querying/parameters/utils/parsing";
import type { ParameterValueOrArray } from "metabase-types/api";

type DateQuarterYearPickerProps = {
  value: ParameterValueOrArray | null | undefined;
  onChange: (value: string) => void;
};

export function DateQuarterYearWidget({
  value,
  onChange,
}: DateQuarterYearPickerProps) {
  const pickerValue = useMemo(() => getPickerValue(value), [value]);

  const handleChange = (newPickerValue: QuarterYearPickerValue) => {
    onChange(serializeDateParameterValue(newPickerValue));
  };

  return <QuarterYearPicker value={pickerValue} onChange={handleChange} />;
}

function getPickerValue(
  value: ParameterValueOrArray | null | undefined,
): QuarterYearPickerValue | undefined {
  return match(deserializeDateParameterValue(value))
    .returnType<QuarterYearPickerValue | undefined>()
    .with({ type: "quarter" }, (value) => value)
    .otherwise(() => undefined);
}
