import { useMemo } from "react";
import { match } from "ts-pattern";

import { QuarterYearPicker } from "metabase/querying/filters/components/QuarterYearPicker";
import type { QuarterYearPickerValue } from "metabase/querying/filters/types";
import { serializeDateParameterValue } from "metabase/querying/parameters/utils/dates";
import { normalizeDateParameterValue } from "metabase/querying/parameters/utils/normalize";
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
  return match(normalizeDateParameterValue(value))
    .returnType<QuarterYearPickerValue | undefined>()
    .with({ type: "quarter" }, value => value)
    .otherwise(() => undefined);
}
