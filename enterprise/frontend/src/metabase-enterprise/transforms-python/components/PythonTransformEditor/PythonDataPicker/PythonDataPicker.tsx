import { useEffect, useState } from "react";
import { t } from "ttag";

import { skipToken, useListTablesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "metabase/ui";
import type {
  DatabaseId,
  PythonTransformTableAliases,
  Table,
} from "metabase-types/api";
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
  database?: DatabaseId;
  disabled?: boolean;
  tables: PythonTransformTableAliases;
  readOnly?: boolean;
  isIngestion: boolean;
  onChange: (
    database: number,
    tables: PythonTransformTableAliases,
    tableInfo: Table[],
  ) => void;
  onIngestionChange: (isIngestion: boolean) => void;
};

export function PythonDataPicker({
  database,
  disabled,
  tables,
  readOnly,
  isIngestion,
  onChange,
  onIngestionChange,
}: PythonDataPickerProps) {
  const [tableSelections, setTableSelections] = useState<TableSelection[]>(
    getInitialTableSelections(tables),
  );

  useEffect(() => {
    setTableSelections(getInitialTableSelections(tables));
  }, [tables]);

  const {
    data: tablesData,
    isLoading: isLoadingTables,
    error: tablesError,
  } = useListTablesQuery(
    database
      ? {
          dbId: database,
          include_hidden: false,
          include_editable_data_model: true,
        }
      : skipToken,
  );

  const handleChange = (selections: TableSelection[]) => {
    if (database) {
      const tableAliases = selectionsToTableAliases(
        selections,
        tablesData ?? [],
      );
      onChange(database, tableAliases, tablesData ?? []);
    }
  };

  if (tablesError) {
    return <LoadingAndErrorWrapper error={tablesError} />;
  }

  const availableTables = (tablesData || []).filter(
    (tbl: Table) => tbl.db_id === database && tbl.active,
  );

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
      <Group gap="xs" align="center" wrap="nowrap">
        <Switch
          checked={isIngestion}
          disabled={disabled || readOnly}
          size="sm"
          label={t`Fetches its own data`}
          wrapperProps={{ "data-testid": "python-ingestion-switch" }}
          onChange={(event) => onIngestionChange(event.currentTarget.checked)}
        />
        <Tooltip
          multiline
          w={260}
          label={t`Gets its data over the network instead of reading source tables. It can store credentials and keeps its own incremental cursor.`}
        >
          <Icon name="info" c="text-secondary" size={14} />
        </Tooltip>
      </Group>
      {database && !isIngestion && (
        <Box>
          <Text fw="bold">{t`Pick tables and alias them`}</Text>
          <Text size="sm" c="text-disabled" mb="sm">
            {t`Select tables to use as data sources and provide aliases that can be referenced in your Python script.`}
          </Text>
          <Stack gap="md">
            {tableSelections.map((selection, index) => (
              <SelectionInput
                key={index}
                selection={selection}
                database={database}
                tables={tables}
                usedAliases={usedAliases}
                availableTables={availableTables}
                onChange={(selection) =>
                  handleSelectionChange(index, selection)
                }
                onRemove={() => handleRemoveTable(index)}
                disabled={disabled || isLoadingTables || readOnly}
              />
            ))}
            <AddTableButton
              onClick={handleAddTable}
              disabled={availableTables.length === 0 || readOnly}
            />
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

function SelectionInput({
  database,
  tables,
  selection,
  availableTables,
  usedAliases,
  onChange,
  onRemove,
  disabled,
}: {
  database: DatabaseId | undefined;
  tables: PythonTransformTableAliases;
  selection: TableSelection;
  availableTables: Table[];
  usedAliases: Set<string>;
  onChange: (selection: TableSelection) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const table = availableTables.find((table) => table.id === selection.tableId);

  function handleAliasChange(newAlias: string) {
    const newSelection = {
      ...selection,
      alias: slugify(newAlias, usedAliases, selection.alias),
    };

    onChange(newSelection);
  }

  function handleTableChange(table: Table | undefined) {
    if (!table || !isConcreteTableId(table.id)) {
      onChange({
        ...selection,
        tableId: undefined,
      });
      return;
    }

    const oldTable = availableTables.find(
      (table) => table.id === selection?.tableId,
    );

    const wasOldAliasManuallySet =
      selection.alias !== "" &&
      (!oldTable ||
        selection.alias !==
          slugify(oldTable.name, usedAliases, selection.alias));

    const newAlias = wasOldAliasManuallySet
      ? selection.alias
      : slugify(table.name, usedAliases);

    onChange({
      ...selection,
      tableId: table.id,
      alias: newAlias,
    });
  }

  return (
    <Stack gap="xs" align="center" w="100%">
      <TableSelector
        database={database}
        table={table}
        selectedTableIds={tables.map((t) => t.table_id)}
        onChange={handleTableChange}
        onRemove={onRemove}
        availableTables={availableTables}
        disabled={disabled}
      />
      <AliasInput
        selection={selection}
        table={table}
        onChange={handleAliasChange}
        usedAliases={usedAliases}
        disabled={disabled}
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
