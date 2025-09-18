import { useEffect, useState } from "react";
import { t } from "ttag";

import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
  useListDatabasesQuery,
  useListTablesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Select,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type {
  Database,
  DatabaseId,
  PythonTransformTableAliases,
  Table,
  TableId,
} from "metabase-types/api";

import S from "./PythonDataPicker.module.css";
import type { TableOption, TableSelection } from "./types";
import {
  getInitialTableSelections,
  selectionsToTableAliases,
  slugify,
} from "./utils";

type PythonDataPickerProps = {
  database?: DatabaseId;
  tables?: PythonTransformTableAliases;
  onChange: (
    database: number,
    tables: PythonTransformTableAliases,
    tableInfo: Table[],
  ) => void;
};

export function PythonDataPicker({
  database,
  tables,
  onChange,
}: PythonDataPickerProps) {
  const [tableSelections, setTableSelections] = useState<TableSelection[]>(
    getInitialTableSelections(tables),
  );

  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databaseError,
  } = useListDatabasesQuery();

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

  const notifyParentOfChange = (
    database: DatabaseId | undefined,
    selections: TableSelection[],
  ) => {
    if (database) {
      const tableAliases = selectionsToTableAliases(selections);
      onChange(database, tableAliases, tablesData ?? []);
    }
  };

  if (databaseError || tablesError) {
    return <LoadingAndErrorWrapper error={databaseError || tablesError} />;
  }

  if (isLoadingDatabases) {
    return <LoadingAndErrorWrapper loading />;
  }

  const availableDatabases = (databasesResponse?.data ?? [])
    .filter((db: Database) => hasFeature(db, "transforms/python"))
    .map((db: Database) => ({
      value: db.id.toString(),
      label: db.name,
    }));

  const availableTables: TableOption[] = (tablesData || [])
    .filter((tbl: Table) => tbl.db_id === database && tbl.active)
    .map((tbl: Table) => ({
      value: tbl.id.toString(),
      label: tbl.display_name || tbl.name,
      table: tbl,
    }));

  const selectedTableIds = new Set(tableSelections.map((s) => s.tableId));
  const usedAliases = new Set(tableSelections.map((s) => s.alias));

  const handleDatabaseChange = (value: string | null) => {
    const newDatabase = value ? parseInt(value) : undefined;
    const newSelections = [
      {
        tableId: undefined,
        alias: "",
      },
    ];
    setTableSelections(newSelections);
    notifyParentOfChange(newDatabase, newSelections);
  };

  const handleTableChange = (
    selectionIndex: number,
    table: Table | undefined,
  ) => {
    if (!table) {
      const newSelections = Array.from(tableSelections);
      newSelections[selectionIndex] = {
        ...newSelections[selectionIndex],
        tableId: undefined,
      };
      setTableSelections(newSelections);
      notifyParentOfChange(database, newSelections);
      return;
    }

    const oldSelection = tableSelections[selectionIndex];
    const oldTable = availableTables.find(
      (t) => t.table.id === oldSelection?.tableId,
    )?.table;
    const wasOldAliasManuallySet =
      oldSelection.alias !== "" &&
      (!oldTable || oldSelection.alias !== slugify(oldTable.name, usedAliases));
    const newAlias = wasOldAliasManuallySet
      ? oldSelection.alias
      : slugify(table.name, usedAliases);

    const newSelections = Array.from(tableSelections);
    newSelections[selectionIndex] = {
      ...oldSelection,
      tableId: table.id,
      alias: newAlias,
    };

    setTableSelections(newSelections);
    notifyParentOfChange(database, newSelections);
  };

  const handleAliasChange = (selectionIndex: number, alias: string) => {
    const newSelections = Array.from(tableSelections);

    const oldSelection = tableSelections[selectionIndex];
    const usedAliasesWithoutThisAlias = new Set(usedAliases);
    usedAliasesWithoutThisAlias.delete(oldSelection.alias);

    newSelections[selectionIndex] = {
      ...oldSelection,
      alias: slugify(alias, usedAliasesWithoutThisAlias),
    };
    setTableSelections(newSelections);
    notifyParentOfChange(database, newSelections);
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
    notifyParentOfChange(database, newSelections);
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
        <Text fw="bold">{t`Source database`}</Text>
        <Text size="sm" c="text-light" mb="sm">
          {t`Select the database that contains your source data`}
        </Text>
        <Select
          data={availableDatabases}
          value={database?.toString() ?? null}
          onChange={handleDatabaseChange}
          placeholder={t`Select a database`}
          clearable
        />
      </Box>
      {database && (
        <Box>
          <Text fw="bold">{t`Source tables`}</Text>
          <Text size="sm" c="text-light" mb="sm">
            {t`Select tables to use as data sources and provide aliases for each`}
          </Text>
          <Stack gap="xs">
            <Group gap="xs">
              <Text fw="bold" size="sm" flex="0 1 45%">{t`Table`}</Text>
              <Text fw="bold" size="sm">{t`Alias`}</Text>
            </Group>

            {tableSelections.map((selection, index) => {
              const table = availableTables.find(
                (t) => t.value === selection.tableId?.toString(),
              )?.table;

              return (
                <Group key={index} gap="xs" align="center" wrap="nowrap">
                  <TableInput
                    table={table}
                    onChange={(table) => handleTableChange(index, table)}
                    availableTables={availableTables}
                    selectedTableIds={selectedTableIds}
                    disabled={isLoadingTables}
                  />

                  <AliasInput
                    selection={selection}
                    table={table}
                    onChange={(newAlias) => handleAliasChange(index, newAlias)}
                    usedAliases={usedAliases}
                  />

                  <ActionIcon
                    onClick={() => handleRemoveTable(index)}
                    aria-label={t`Remove table`}
                  >
                    <Icon name="trash" />
                  </ActionIcon>
                </Group>
              );
            })}

            <Button
              leftSection={<Icon name="add" />}
              variant="subtle"
              onClick={handleAddTable}
              disabled={availableTables.length === 0}
            >
              {t`Add another table`}
            </Button>
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

function TableInput({
  availableTables,
  selectedTableIds,
  disabled,
  onChange,
  table,
}: {
  table: Table | undefined;
  availableTables: TableOption[];
  selectedTableIds: Set<TableId | undefined>;
  disabled?: boolean;
  onChange: (table: Table | undefined) => void;
}) {
  // Filter available tables to exclude already selected ones (except current selection)
  const tableOptions = availableTables.filter(
    (tableOption) =>
      !selectedTableIds.has(tableOption.table?.id) ||
      tableOption.value === table?.id?.toString(),
  );

  function handleChange(value: string | null) {
    const table = tableOptions.find((t) => t.value === value)?.table;
    if (!table) {
      return;
    }
    onChange(table);
  }

  return (
    <Select
      flex="0 1 50%"
      data={tableOptions}
      value={table?.id?.toString() ?? null}
      onChange={handleChange}
      onClear={() => onChange(undefined)}
      placeholder={t`Select a table`}
      clearable
      disabled={disabled}
    />
  );
}

function AliasInput({
  table,
  selection,
  onChange,
  usedAliases,
}: {
  selection: TableSelection;
  table?: Table;
  onChange: (value: string) => void;
  usedAliases: Set<string>;
}) {
  const [value, setValue] = useState(selection.alias);

  useEffect(() => {
    setValue(selection.alias);
  }, [selection.alias]);

  const usedAliasesWithoutThisAlias = new Set(usedAliases);
  usedAliasesWithoutThisAlias.delete(selection.alias);

  const defaultAlias = table
    ? slugify(table.name, usedAliasesWithoutThisAlias)
    : "";
  const isManualAlias = selection.alias !== defaultAlias;
  const showReset = table && isManualAlias;

  return (
    <TextInput
      flex="0 1 50%"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onChange(value)}
      placeholder={t`Enter alias`}
      rightSection={
        showReset ? (
          <ActionIcon
            onClick={() => onChange(defaultAlias)}
            aria-label={t`Reset alias to default`}
            color="gray"
            variant="subtle"
          >
            <Icon name="refresh" size={12} />
          </ActionIcon>
        ) : null
      }
    />
  );
}
