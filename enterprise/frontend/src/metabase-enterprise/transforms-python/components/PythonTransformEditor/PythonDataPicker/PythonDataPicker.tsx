import { useEffect, useState } from "react";
import { t } from "ttag";

import { hasFeature } from "metabase/admin/databases/utils";
import {
  skipToken,
  useListDatabasesQuery,
  useListTablesQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import { Box, Button, Icon, Stack, Text } from "metabase/ui";
import type {
  Database,
  DatabaseId,
  PythonTransformTableAliases,
  Table,
} from "metabase-types/api";

import { AliasInput } from "./AliasInput";
import S from "./PythonDataPicker.module.css";
import { TableSelector } from "./TableSelector";
import type { TableSelection } from "./types";
import {
  getInitialTableSelections,
  isConcreteTableId,
  selectionsToTableAliases,
  slugify,
} from "./utils";

type PythonDataPickerProps = {
  database?: DatabaseId;
  tables: PythonTransformTableAliases;
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

  useEffect(() => {
    setTableSelections(getInitialTableSelections(tables));
  }, [tables]);

  const {
    data: databases,
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

  const handleChange = (
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

  const availableTables = (tablesData || []).filter(
    (tbl: Table) => tbl.db_id === database && tbl.active,
  );

  const usedAliases = new Set(tableSelections.map((s) => s.alias));

  const handleDatabaseChange = (value: string | null) => {
    const newDatabase = value ? parseInt(value) : undefined;

    if (newDatabase === database) {
      return;
    }

    // Clear selections since they won't make sense
    const newSelections = [
      {
        tableId: undefined,
        alias: "",
      },
    ];
    setTableSelections(newSelections);
    handleChange(newDatabase, newSelections);
  };

  const handleSelectionChange = (
    selectionIndex: number,
    selection: TableSelection,
  ) => {
    const newSelections = Array.from(tableSelections);
    newSelections[selectionIndex] = selection;
    setTableSelections(newSelections);
    handleChange(database, newSelections);
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
    handleChange(database, newSelections);
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
        <Text size="sm" c="text-tertiary" mb="sm">
          {t`Select the database that contains your source data.`}
        </Text>

        <DatabaseDataSelector
          className={S.databaseSelector}
          selectedDatabaseId={database}
          setDatabaseFn={handleDatabaseChange}
          databases={databases?.data ?? []}
          databaseIsDisabled={(database: Database) =>
            !hasFeature(database, "transforms/python")
          }
        />
      </Box>
      {database && (
        <Box>
          <Text fw="bold">{t`Pick tables and alias them`}</Text>
          <Text size="sm" c="text-tertiary" mb="sm">
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
                disabled={isLoadingTables}
              />
            ))}
            <AddTableButton
              onClick={handleAddTable}
              disabled={availableTables.length === 0}
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
        selectedTableIds={Object.values(tables)}
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
