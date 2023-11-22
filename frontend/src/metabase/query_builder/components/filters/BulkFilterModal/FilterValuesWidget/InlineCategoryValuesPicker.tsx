import { useMemo } from "react";
import { t } from "ttag";
import { Checkbox } from "metabase/ui";
import type { FieldValue, RowValue } from "metabase-types/api";
import { CheckboxGrid } from "./InlineCategoryValuesPicker.styled";

interface InlineCategoryValuesPickerProps<T> {
  value: T[];
  fieldValues: FieldValue[];
  onChange: (value: string[]) => void;
}

export function InlineCategoryValuesPicker<T extends string | number>({
  value,
  fieldValues,
  onChange,
}: InlineCategoryValuesPickerProps<T>) {
  const formattedValue = useMemo(() => value.map(formatValue), [value]);

  // Field values like `null` are expected to be handled
  // with "is-empty" and "is-null" operators
  const filteredFieldValues = useMemo(() => {
    return fieldValues.filter(
      fieldValue => getFieldValue(fieldValue) !== "empty",
    );
  }, [fieldValues]);

  // We have to explicitly set the number of rows,
  // because we want options to flow by column
  const rows = Math.round(filteredFieldValues.length / 2) || 2;

  return (
    <CheckboxGrid value={formattedValue} rows={rows} onChange={onChange}>
      {filteredFieldValues.map(fieldValue => {
        const value = getFieldValue(fieldValue);
        const displayValue = getFieldDisplayValue(fieldValue);
        return <Checkbox key={value} value={value} label={displayValue} />;
      })}
    </CheckboxGrid>
  );
}

function formatValue(value?: RowValue): string {
  return value?.toString() || "empty";
}

function getFieldValue(fieldValue: FieldValue): string {
  const [value] = fieldValue;
  return formatValue(value);
}

function getFieldDisplayValue(fieldValue: FieldValue): string {
  const [value, displayValue] = fieldValue;
  return displayValue?.toString() || value?.toString() || t`empty`;
}
