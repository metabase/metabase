import { useMemo } from "react";
import { match } from "ts-pattern";

import { RelativeDateShortcutPicker } from "metabase/querying/common/components/RelativeDateShortcutPicker";
import type { RelativeDatePickerValue } from "metabase/querying/common/types";
import {
  deserializeDateParameterValue,
  serializeDateParameterValue,
} from "metabase/querying/parameters/utils/parsing";
import type { ParameterValueOrArray } from "metabase-types/api";

type DateRelativePickerProps = {
  value: ParameterValueOrArray | null | undefined;
  onChange: (value: string) => void;
};

export function DateRelativeWidget({
  value,
  onChange,
}: DateRelativePickerProps) {
  const pickerValue = useMemo(() => getPickerValue(value), [value]);

  const handleChange = (newPickerValue: RelativeDatePickerValue) => {
    onChange(serializeDateParameterValue(newPickerValue));
  };

  return (
    <RelativeDateShortcutPicker value={pickerValue} onChange={handleChange} />
  );
}

function getPickerValue(
  value: ParameterValueOrArray | null | undefined,
): RelativeDatePickerValue | undefined {
  return match(deserializeDateParameterValue(value))
    .returnType<RelativeDatePickerValue | undefined>()
    .with({ type: "relative" }, (value) => value)
    .otherwise(() => undefined);
}
