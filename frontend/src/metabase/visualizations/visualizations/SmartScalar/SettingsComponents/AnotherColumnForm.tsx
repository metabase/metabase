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
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
import { COMPARISON_TYPES } from "../constants";
import { DoneButton } from "./SmartScalarSettingsWidgets.styled";

interface AnotherColumnFormProps {
  value?: SmartScalarComparisonAnotherColumn;
  columns: DatasetColumn[];
  onChange: (value: SmartScalarComparisonAnotherColumn) => void;
  onBack: () => void;
}

export function AnotherColumnForm({
  value: selectedValue,
  columns,
  onChange,
  onBack,
}: AnotherColumnFormProps) {
  const [label, setLabel] = useState(selectedValue?.label || "");
  const [columnKey, setColumnKey] = useState(selectedValue?.column || "");

  const canSubmit = label.length > 0 && columnKey.length > 0;

  const columnOptions = useMemo(
    () =>
      columns.map(column => ({
        label: column.display_name,
        value: getColumnKey(column),
      })),
    [columns],
  );

  const handleChangeColumnKey = (value: string) => {
    setColumnKey(value);
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
      column: columnKey,
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
            autoFocus={!columnKey}
            value={columnKey}
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
