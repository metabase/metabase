import { useField } from "formik";
import type { ReactNode } from "react";
import { t } from "ttag";

import { type ComboboxItem, Input, MultiSelect, Stack } from "metabase/ui";
import type { IndexColumn, IndexColumnDirection } from "metabase-types/api";

import { DirectionList } from "./DirectionList";

type ColumnsFieldProps = {
  name: string;
  label?: ReactNode;
  description?: ReactNode;
  options: ComboboxItem[];
  supportsDirections: boolean;
  disabled?: boolean;
};

export function ColumnsField({
  name,
  label,
  description,
  options,
  supportsDirections,
  disabled,
}: ColumnsFieldProps) {
  const [
    { value: selectedColumns = [] },
    { error, touched },
    { setValue, setTouched },
  ] = useField<IndexColumn[]>(name);

  function handleColumnChange(names: string[]) {
    setValue(
      names.map((columnName) => {
        const existingColumnSelection = selectedColumns.find(
          (column) => column.name === columnName,
        );
        if (existingColumnSelection) {
          return existingColumnSelection;
        }
        return supportsDirections
          ? { name: columnName, direction: "asc" }
          : { name: columnName };
      }),
    );
    setTouched(true);
  }

  function handleDirectionChange(
    columnName: string,
    direction: IndexColumnDirection,
  ) {
    setValue(
      selectedColumns.map((column) =>
        column.name === columnName ? { ...column, direction } : column,
      ),
    );
  }

  return (
    <Input.Wrapper
      label={label}
      description={description}
      error={touched ? error : null}
    >
      <Stack gap="sm" mt="xs">
        <MultiSelect
          data={options}
          value={selectedColumns.map((column) => column.name)}
          onChange={handleColumnChange}
          onBlur={() => setTouched(true)}
          placeholder={t`Select columns`}
          searchable
          disabled={disabled}
        />
        {supportsDirections && selectedColumns.length > 0 && (
          <DirectionList
            columns={selectedColumns}
            options={options}
            onChange={handleDirectionChange}
            disabled={disabled}
          />
        )}
      </Stack>
    </Input.Wrapper>
  );
}
