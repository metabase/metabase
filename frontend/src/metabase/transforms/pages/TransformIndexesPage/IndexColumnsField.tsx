import { useField } from "formik";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { FormField } from "metabase/forms";
import {
  type ComboboxItem,
  Group,
  MultiSelect,
  SegmentedControl,
  Stack,
  Text,
} from "metabase/ui";
import type {
  IndexColumn,
  IndexColumnDirection,
  IndexField,
} from "metabase-types/api";

type IndexColumnsFieldProps = {
  field: IndexField;
  columnOptions: ComboboxItem[];
  disabled?: boolean;
};

export function IndexColumnsField({
  field,
  columnOptions,
  disabled,
}: IndexColumnsFieldProps) {
  const [{ value }, { error, touched }, { setValue, setTouched }] = useField<
    IndexColumn[]
  >(field.name);
  const columns = useMemo(() => value ?? [], [value]);

  const handleColumnsChange = useCallback(
    (names: string[]) => {
      const byName = new Map(columns.map((column) => [column.name, column]));
      // Preserve each column's chosen direction and default new picks to asc;
      // selection order is the index column order.
      setValue(
        names.map(
          (name) => byName.get(name) ?? { name, direction: "asc" as const },
        ),
      );
    },
    [columns, setValue],
  );

  const handleDirectionChange = useCallback(
    (name: string, direction: IndexColumnDirection) => {
      setValue(
        columns.map((column) =>
          column.name === name ? { ...column, direction } : column,
        ),
      );
    },
    [columns, setValue],
  );

  return (
    <FormField
      title={field["display-name"]}
      error={touched ? error : undefined}
    >
      <Stack gap="sm">
        <MultiSelect
          data={columnOptions}
          value={columns.map((column) => column.name)}
          placeholder={t`Select columns`}
          disabled={disabled}
          searchable
          onChange={handleColumnsChange}
          onBlur={() => setTouched(true)}
        />
        {field.directions && columns.length > 0 && (
          <Stack gap="xs">
            {columns.map((column) => (
              <ColumnDirectionRow
                key={column.name}
                column={column}
                columnOptions={columnOptions}
                onChange={handleDirectionChange}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </FormField>
  );
}

type ColumnDirectionRowProps = {
  column: IndexColumn;
  columnOptions: ComboboxItem[];
  onChange: (name: string, direction: IndexColumnDirection) => void;
};

function ColumnDirectionRow({
  column,
  columnOptions,
  onChange,
}: ColumnDirectionRowProps) {
  const label =
    columnOptions.find((option) => option.value === column.name)?.label ??
    column.name;

  const directionOptions: { value: IndexColumnDirection; label: string }[] = [
    { value: "asc", label: t`Asc` },
    { value: "desc", label: t`Desc` },
  ];

  const handleChange = useCallback(
    (value: string) => {
      if (value === "asc" || value === "desc") {
        onChange(column.name, value);
      }
    },
    [column.name, onChange],
  );

  return (
    <Group justify="space-between" wrap="nowrap">
      <Text>{label}</Text>
      <SegmentedControl
        size="xs"
        data={directionOptions}
        value={column.direction ?? "asc"}
        onChange={handleChange}
      />
    </Group>
  );
}
