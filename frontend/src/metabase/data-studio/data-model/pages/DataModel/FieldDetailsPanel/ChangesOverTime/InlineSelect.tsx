import { findFieldById } from "metabase/metadata/table-structure";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Box, Select } from "metabase/ui";
import type { Field, FieldId } from "metabase-types/api";

export function InlineFieldSelect({
  label,
  fields,
  value,
  disabled,
  withinPortal = true,
  onChange,
}: {
  label: string;
  withinPortal?: boolean;
  fields: Field[];
  value: FieldId | null;
  disabled: boolean;
  onChange: (fieldId: FieldId | null) => void;
}) {
  return (
    <InlineSelect
      label={label}
      withinPortal={withinPortal}
      data={fields.map((field) => ({
        value: String(getRawTableFieldId(field)),
        label: field.display_name,
      }))}
      value={findFieldById({ fields }, value) != null ? String(value) : null}
      disabled={disabled}
      onChange={(next) => onChange(next != null ? Number(next) : null)}
    />
  );
}

export function InlineSelect({
  label,
  data,
  value,
  disabled,
  withinPortal = true,
  onChange,
}: {
  label: string;
  withinPortal?: boolean;
  data: { value: string; label: string }[];
  value: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  const selected = data.find((option) => option.value === value);
  return (
    <Box component="span" display="inline-block" mx={4}>
      <Select
        aria-label={label}
        size="xs"
        w={`calc(${Math.max(selected?.label.length ?? 8, 8)}ch + 3rem)`}
        data={data}
        value={value}
        placeholder={label}
        disabled={disabled}
        comboboxProps={{ width: "max-content", withinPortal }}
        onChange={onChange}
      />
    </Box>
  );
}
