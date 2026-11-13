import { t } from "ttag";

import { findFieldById } from "metabase/metadata/table-structure";
import { Select } from "metabase/ui";
import type { Field, FieldId } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";

type ColumnSelectProps = {
  label: string;
  fields: Field[];
  value: FieldId | null;
  placeholder?: string;
  disabled: boolean;
  onChange: (fieldId: FieldId | null) => void;
};

/** One of a table's columns, in a details table cell */
export function ColumnSelect({
  label,
  fields,
  value,
  placeholder = t`Choose a column`,
  disabled,
  onChange,
}: ColumnSelectProps) {
  return (
    <Select
      aria-label={label}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={fields.map((field) => ({
        value: String(field.id),
        label: field.display_name,
      }))}
      value={findFieldById({ fields }, value) != null ? String(value) : null}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(next) => onChange(next != null ? Number(next) : null)}
    />
  );
}
