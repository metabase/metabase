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
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type {
  Database,
  DatabaseId,
  PythonTransformTableAliases,
  Table,
} from "metabase-types/api";

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

  const availableTables = (tablesData || []).filter(
    (tbl: Table) => tbl.db_id === database && tbl.active,
  );

  const usedAliases = new Set(tableSelections.map((s) => s.alias));

  const handleDatabaseChange = (value: string | null) => {
    const newDatabase = value ? parseInt(value) : undefined;

    // Clear selections since they won't make sense
    const newSelections = [
      {
        tableId: undefined,
        alias: "",
      },
    ];
    setTableSelections(newSelections);
    notifyParentOfChange(newDatabase, newSelections);
  };

  const handleSelectionChange = (
    selectionIndex: number,
    selection: TableSelection,
  ) => {
    const newSelections = Array.from(tableSelections);
    newSelections[selectionIndex] = selection;
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
          <Text fw="bold">{t`Source tables`}</Text>
          <Text size="sm" c="text-light" mb="sm">
            {t`Select tables to use as data sources and provide aliases for each`}
          </Text>
          <Stack gap="xs">
            <Group gap="xs">
              <Text fw="bold" size="sm" flex="0 1 45%">{t`Table`}</Text>
              <Text fw="bold" size="sm">{t`Alias`}</Text>
            </Group>

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
    if (!table) {
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
    <Group gap="xs" align="center" wrap="nowrap">
      <TableSelector
        database={database}
        table={table}
        selectedTableIds={Object.values(tables)}
        onChange={handleTableChange}
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

      <ActionIcon onClick={onRemove} aria-label={t`Remove table`}>
        <Icon name="trash" />
      </ActionIcon>
    </Group>
  );
}

function AliasInput({
  table,
  selection,
  onChange,
  usedAliases,
  disabled,
}: {
  selection: TableSelection;
  table?: Table;
  onChange: (value: string) => void;
  usedAliases: Set<string>;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(selection.alias);

  useEffect(() => {
    setValue(selection.alias);
  }, [selection.alias]);

  const defaultAlias = table
    ? slugify(table.name, usedAliases, selection.alias)
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
      disabled={disabled}
    />
  );
}
