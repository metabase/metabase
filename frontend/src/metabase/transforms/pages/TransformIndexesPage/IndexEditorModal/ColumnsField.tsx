import { useField } from "formik";
import type { ReactNode } from "react";
import { t } from "ttag";

import {
  Card,
  Group,
  Input,
  MultiSelect,
  SegmentedControl,
  Stack,
  Text,
} from "metabase/ui";
import type { IndexColumn, IndexColumnDirection } from "metabase-types/api";

import type { ColumnOption } from "./types";

type ColumnsFieldProps = {
  name: string;
  label?: ReactNode;
  description?: ReactNode;
  options: ColumnOption[];
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

type DirectionListProps = {
  columns: IndexColumn[];
  options: ColumnOption[];
  onChange: (columnName: string, direction: IndexColumnDirection) => void;
  disabled?: boolean;
};

function DirectionList({
  columns,
  options,
  onChange,
  disabled,
}: DirectionListProps) {
  return (
    <Card withBorder shadow="none" p="md">
      <Stack gap="sm">
        <Text fw="bold">{t`Sort order for each column to be stored in`}</Text>
        {columns.map((column) => (
          <Group key={column.name} justify="space-between" wrap="nowrap">
            <Text>{getColumnLabel(options, column.name)}</Text>
            <SegmentedControl
              value={column.direction}
              onChange={(direction) =>
                onChange(column.name, direction as IndexColumnDirection)
              }
              data={getDirectionOptions()}
              disabled={disabled}
            />
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

function getColumnLabel(columns: ColumnOption[], columnName: string) {
  return (
    columns.find((option) => option.value === columnName)?.label ?? columnName
  );
}

function getDirectionOptions(): {
  value: IndexColumnDirection;
  label: string;
}[] {
  return [
    { value: "asc", label: t`Asc` },
    { value: "desc", label: t`Desc` },
  ];
}
