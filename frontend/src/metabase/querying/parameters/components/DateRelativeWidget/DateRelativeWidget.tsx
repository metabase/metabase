import { useMemo } from "react";
import { match } from "ts-pattern";

import { RelativeDateShortcutPicker } from "metabase/querying/filters/components/RelativeDateShortcutPicker";
import type { RelativeDatePickerValue } from "metabase/querying/filters/types";
import {
  deserializeDateFilter,
  serializeDateFilter,
} from "metabase/querying/parameters/utils/dates";

type DateRelativePickerProps = {
  value: string | undefined;
  onChange: (value: string) => void;
};

export function DateRelativeWidget({
  value: valueText,
  onChange,
}: DateRelativePickerProps) {
  const value = useMemo(() => getPickerValue(valueText), [valueText]);

  const handleChange = (value: RelativeDatePickerValue) => {
    onChange(serializeDateFilter(value));
  };

  return <RelativeDateShortcutPicker value={value} onChange={handleChange} />;
}

function getPickerValue(
  valueText: string | undefined,
): RelativeDatePickerValue | undefined {
  const value =
    valueText != null ? deserializeDateFilter(valueText) : undefined;
  return match(value)
    .returnType<RelativeDatePickerValue | undefined>()
    .with({ type: "relative" }, value => value)
    .otherwise(() => undefined);
}
