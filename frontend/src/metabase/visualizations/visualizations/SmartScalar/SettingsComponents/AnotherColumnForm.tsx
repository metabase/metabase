import type { ChangeEvent, FormEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Flex,
  PopoverBackButton,
  TextInput,
  Select,
  Stack,
} from "metabase/ui";
import type {
  DatasetColumn,
  SmartScalarComparisonAnotherColumn,
} from "metabase-types/api";

import { COMPARISON_TYPES } from "../constants";

import { DoneButton } from "./SmartScalarSettingsWidgets.styled";

interface AnotherColumnFormProps {
  value?: SmartScalarComparisonAnotherColumn;
  columns: DatasetColumn[];
  onChange: (value: Omit<SmartScalarComparisonAnotherColumn, "id">) => void;
  onBack: () => void;
}

export function AnotherColumnForm({
  value: selectedValue,
  columns,
  onChange,
  onBack,
}: AnotherColumnFormProps) {
  const initialValues = getInitialValues(selectedValue, columns);
  const [label, setLabel] = useState(initialValues.label);
  const [column, setColumn] = useState(initialValues.column);

  const canSubmit = label.length > 0 && column.length > 0;

  const columnOptions = useMemo(
    () =>
      columns.map(column => ({
        label: column.display_name,
        value: column.name,
      })),
    [columns],
  );

  const handleChangeColumnKey = (value: string) => {
    setColumn(value);
    const option = columnOptions.find(option => option.value === value);
    setLabel(option?.label || "");
  };

  const handleChangeLabel = (e: ChangeEvent<HTMLInputElement>) => {
    setLabel(e.target.value);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    onChange({
      type: COMPARISON_TYPES.ANOTHER_COLUMN,
      label,
      column,
    });
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <Flex direction="column" align="flex-start" gap="lg">
        <PopoverBackButton
          onClick={onBack}
        >{t`Value from another column`}</PopoverBackButton>
        <Stack pos="relative" w="100%" spacing="md">
          <Select
            autoFocus={!column}
            value={column}
            data={columnOptions}
            label={t`Column`}
            searchable
            onChange={handleChangeColumnKey}
            styles={{ dropdown: { width: "100%" } }}
            withinPortal={false}
          />
          <TextInput
            value={label}
            label={t`Label`}
            onChange={handleChangeLabel}
          />
        </Stack>
        <DoneButton type="submit" disabled={!canSubmit}>
          {t`Done`}
        </DoneButton>
      </Flex>
    </Box>
  );
}

function getInitialValues(
  value: SmartScalarComparisonAnotherColumn | undefined,
  columns: DatasetColumn[],
) {
  if (value) {
    return value;
  }

  if (columns.length === 1) {
    const column = columns[0];
    return {
      label: column.display_name,
      column: column.name,
    };
  }

  return { label: "", column: "" };
}
