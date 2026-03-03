import React, { useEffect, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetTableQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { OmniPickerItem } from "metabase/common/components/Pickers";
import { isTableItem } from "metabase/common/components/Pickers/DataPicker/types";
import { Box, Button, Icon, Stack, Text } from "metabase/ui";
import type { PythonTransformTableAliases, TableId } from "metabase-types/api";
import { isConcreteTableId } from "metabase-types/api";

import { AliasInput } from "./AliasInput";
import S from "./PythonDataPicker.module.css";
import { TableSelector } from "./TableSelector";
import type { TableSelection } from "./types";
import {
  getInitialTableSelections,
  selectionsToTableAliases,
  slugify,
} from "./utils";

type PythonDataPickerProps = {
  disabled?: boolean;
  tables: PythonTransformTableAliases;
  readOnly?: boolean;
  onChange: (tables: PythonTransformTableAliases) => void;
};

export function PythonDataPicker({
  disabled,
  tables,
  readOnly,
  onChange,
}: PythonDataPickerProps) {
  const [tableSelections, setTableSelections] = useState<TableSelection[]>(
    getInitialTableSelections(tables),
  );

  useEffect(() => {
    setTableSelections(getInitialTableSelections(tables));
  }, [tables]);

  const handleChange = (selections: TableSelection[]) => {
    const tableAliases = selectionsToTableAliases(selections);
    onChange(tableAliases);
  };

  const usedAliases = new Set(tableSelections.map((s) => s.alias));

  const handleSelectionChange = (
    selectionIndex: number,
    selection: TableSelection,
  ) => {
    const newSelections = Array.from(tableSelections);
    newSelections[selectionIndex] = selection;
    setTableSelections(newSelections);
    handleChange(newSelections);
  };

  const handleAddTable = () => {
    setTableSelections([
      ...tableSelections,
      {
        tableId: undefined,
        alias: "",
      },
    ]);
  };

  const handleRemoveTable = (selectionIndex: number) => {
    const newSelections = Array.from(tableSelections);
    newSelections.splice(selectionIndex, 1);
    setTableSelections(newSelections);
    handleChange(newSelections);
  };

  return (
    <Stack
      p="md"
      gap="md"
      h="100%"
      w="30%"
      miw="300px"
      className={S.dataPicker}
      data-testid="python-data-picker"
    >
      <Box>
        <Text fw="bold">{t`Pick tables and alias them`}</Text>
        <Text size="sm" c="text-tertiary" mb="sm">
          {t`Select tables to use as data sources and provide aliases that can be referenced in your transform.`}
        </Text>
        <Stack gap="md">
          {tableSelections.map((selection, index) => (
            <SelectionInput
              key={index}
              selection={selection}
              tables={tables}
              usedAliases={usedAliases}
              onChange={(selection) => handleSelectionChange(index, selection)}
              onRemove={() => handleRemoveTable(index)}
              disabled={disabled || readOnly}
            />
          ))}
          <AddTableButton onClick={handleAddTable} disabled={readOnly} />
        </Stack>
      </Box>
    </Stack>
  );
}

function SelectionInput({
  tables,
  selection,
  usedAliases,
  onChange,
  onRemove,
  disabled,
}: {
  tables: PythonTransformTableAliases;
  selection: TableSelection;
  usedAliases: Set<string>;
  onChange: (selection: TableSelection) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const {
    data: table,
    error,
    isLoading,
  } = useGetTableQuery(
    selection.tableId ? { id: selection.tableId } : skipToken,
  );

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  function handleAliasChange(newAlias: string) {
    const newSelection = {
      ...selection,
      alias: slugify(newAlias, usedAliases, selection.alias),
    };

    onChange(newSelection);
  }

  function handleTableChange(newTableId: TableId, newTable: OmniPickerItem) {
    if (!isConcreteTableId(newTableId) || !isTableItem(newTable)) {
      onChange({
        ...selection,
        tableId: undefined,
      });
      return;
    }

    const wasOldAliasManuallySet =
      selection.alias !== "" &&
      (!table ||
        selection.alias !== slugify(table.name, usedAliases, selection.alias));

    const newAlias = wasOldAliasManuallySet
      ? selection.alias
      : slugify(newTable.name, usedAliases);

    onChange({
      ...selection,
      tableId: newTableId,
      alias: newAlias,
    });
  }

  return (
    <Stack gap="xs" align="center" w="100%">
      <TableSelector
        selection={selection}
        selectedTableIds={Object.values(tables)}
        onChange={handleTableChange}
        onRemove={onRemove}
        disabled={disabled || isLoading}
        table={table}
      />
      <AliasInput
        selection={selection}
        onChange={handleAliasChange}
        usedAliases={usedAliases}
        disabled={disabled || isLoading}
        table={table}
      />
    </Stack>
  );
}

function AddTableButton({
  onClick,
  disabled,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Box>
      <Button
        leftSection={<Icon name="add_data" />}
        variant="subtle"
        px={0}
        onClick={onClick}
        disabled={disabled}
      >
        {t`Add a table`}
      </Button>
    </Box>
  );
}
