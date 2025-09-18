import { useState } from "react";
import { t } from "ttag";

import { hasFeature } from "metabase/admin/databases/utils";
import { useListDatabasesQuery, useListTablesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { slugify } from "metabase/lib/formatting";
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
import type { Database, Table } from "metabase-types/api";

import S from "./PythonDataPicker.module.css";

type TableSelection = {
  id: string; // unique ID for this selection row
  tableId: number | undefined;
  alias: string;
  aliasManuallySet?: boolean; // Track if user manually edited the alias
};

type PythonDataPickerProps = {
  database?: number;
  tables?: Record<string, number>; // alias -> table-id mapping
  onChange: (
    database: number,
    tables: Record<string, { id: number; name: string }>,
  ) => void;
};

export function PythonDataPicker({
  database,
  tables,
  onChange,
}: PythonDataPickerProps) {
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<
    number | undefined
  >(database);

  // Initialize table selections from props
  const initializeTableSelections = (): TableSelection[] => {
    if (tables && Object.keys(tables).length > 0) {
      return Object.entries(tables).map(([alias, tableId], index) => ({
        id: `table-${index}-${Date.now()}`,
        tableId,
        alias,
        aliasManuallySet: true, // Existing aliases are considered manually set
      }));
    }
    // Start with one empty row by default
    return [
      {
        id: `table-0-${Date.now()}`,
        tableId: undefined,
        alias: "",
        aliasManuallySet: false,
      },
    ];
  };

  const [tableSelections, setTableSelections] = useState<TableSelection[]>(
    initializeTableSelections,
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
    selectedDatabaseId
      ? {
          dbId: selectedDatabaseId,
          include_hidden: false,
          include_editable_data_model: true,
        }
      : undefined,
    {
      skip: !selectedDatabaseId,
    },
  );

  const notifyParentOfChange = (
    dbId: number | undefined,
    selections: TableSelection[],
    tableIdToName?: Map<number, string>,
  ) => {
    if (dbId) {
      const tablesMap: Record<string, { id: number; name: string }> = {};

      selections.forEach((selection) => {
        if (selection.tableId && selection.alias) {
          const tableName =
            tableIdToName?.get(selection.tableId) ||
            `Table ${selection.tableId}`;
          tablesMap[selection.alias] = {
            id: selection.tableId,
            name: tableName,
          };
        }
      });
      onChange(dbId, tablesMap);
    }
  };

  if (databaseError || tablesError) {
    return <LoadingAndErrorWrapper error={databaseError || tablesError} />;
  }

  if (isLoadingDatabases) {
    return <LoadingAndErrorWrapper loading />;
  }

  const databases = (databasesResponse?.data ?? [])
    .filter((db: Database) => hasFeature(db, "transforms/python"))
    .map((db: Database) => ({
      value: db.id.toString(),
      label: db.name,
    }));

  const availableTables = (tablesData || [])
    .filter((tbl: Table) => tbl.db_id === selectedDatabaseId && tbl.active)
    .map((tbl: Table) => ({
      value: tbl.id.toString(),
      label: tbl.display_name || tbl.name,
      table: tbl,
    }));

  const tableIdToNameMap = new Map<number, string>(
    availableTables.map((t) => [parseInt(t.value), t.table.name]),
  );

  const handleDatabaseChange = (value: string | null) => {
    const dbId = value ? parseInt(value) : undefined;
    setSelectedDatabaseId(dbId);
    const newSelections = [
      {
        id: `table-0-${Date.now()}`,
        tableId: undefined,
        alias: "",
        aliasManuallySet: false,
      },
    ];
    setTableSelections(newSelections);
    notifyParentOfChange(dbId, newSelections);
  };

  const handleTableChange = (selectionId: string, value: string | null) => {
    const newSelections = tableSelections.map((selection) => {
      if (selection.id === selectionId) {
        const tableId = value ? parseInt(value) : undefined;
        const table = availableTables.find((t) => t.value === value)?.table;

        const newAlias = table ? slugify(table.name) : "";

        return {
          ...selection,
          tableId,
          alias: selection.aliasManuallySet ? selection.alias : newAlias,
          aliasManuallySet: selection.aliasManuallySet || false,
        };
      }
      return selection;
    });
    setTableSelections(newSelections);
    notifyParentOfChange(selectedDatabaseId, newSelections, tableIdToNameMap);
  };

  const handleAliasChange = (selectionId: string, alias: string) => {
    // Only allow valid Python identifier characters (letters, numbers, underscores)
    // and ensure it doesn't start with a number
    const validAlias = alias
      .replace(/[^a-zA-Z0-9_]/g, "")
      .replace(/^(\d)/, "_$1");

    const newSelections = tableSelections.map((selection) =>
      selection.id === selectionId
        ? { ...selection, alias: validAlias, aliasManuallySet: true }
        : selection,
    );
    setTableSelections(newSelections);
    notifyParentOfChange(selectedDatabaseId, newSelections, tableIdToNameMap);
  };

  const handleResetAlias = (selectionId: string) => {
    const newSelections = tableSelections.map((selection) => {
      if (selection.id === selectionId && selection.tableId) {
        const table = availableTables.find(
          (t) => t.value === selection.tableId!.toString(),
        )?.table;
        if (table) {
          return {
            ...selection,
            alias: slugify(table.name),
            aliasManuallySet: false,
          };
        }
      }
      return selection;
    });
    setTableSelections(newSelections);
    notifyParentOfChange(selectedDatabaseId, newSelections, tableIdToNameMap);
  };

  const handleAddTable = () => {
    const newSelections = [
      ...tableSelections,
      {
        id: `table-${tableSelections.length}-${Date.now()}`,
        tableId: undefined,
        alias: "",
        aliasManuallySet: false,
      },
    ];
    setTableSelections(newSelections);
    // Don't notify parent for adding empty row
  };

  const handleRemoveTable = (selectionId: string) => {
    const newSelections = tableSelections.filter(
      (selection) => selection.id !== selectionId,
    );
    setTableSelections(newSelections);
    notifyParentOfChange(selectedDatabaseId, newSelections, tableIdToNameMap);
  };

  const selectedTableIds = new Set(
    tableSelections
      .filter((s) => s.tableId !== undefined)
      .map((s) => s.tableId?.toString()),
  );

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
          data={databases}
          value={selectedDatabaseId?.toString() || null}
          onChange={handleDatabaseChange}
          placeholder={t`Select a database`}
          clearable
        />
      </Box>
      {selectedDatabaseId && (
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

            {tableSelections.map((selection) => {
              // Filter available tables to exclude already selected ones (except current selection)
              const filteredTables = availableTables.filter(
                (table) =>
                  !selectedTableIds.has(table.value) ||
                  table.value === selection.tableId?.toString(),
              );

              const table = availableTables.find(
                (t) => t.value === selection.tableId?.toString(),
              )?.table;
              const defaultAlias = table ? slugify(table.name) : "";
              const showReset =
                selection.aliasManuallySet &&
                selection.alias !== defaultAlias &&
                table;

              return (
                <Group key={selection.id} gap="xs" align="center" wrap="nowrap">
                  <Select
                    flex="0 1 50%"
                    data={filteredTables}
                    value={selection.tableId?.toString() || null}
                    onChange={(value) => handleTableChange(selection.id, value)}
                    placeholder={t`Select a table`}
                    clearable
                    disabled={isLoadingTables}
                  />
                  <TextInput
                    flex="0 1 50%"
                    value={selection.alias}
                    onChange={(e) =>
                      handleAliasChange(selection.id, e.target.value)
                    }
                    placeholder={t`Enter alias`}
                    rightSection={
                      showReset ? (
                        <ActionIcon
                          onClick={() => handleResetAlias(selection.id)}
                          aria-label={t`Reset alias to default`}
                          color="gray"
                          variant="subtle"
                        >
                          <Icon name="refresh" size={12} />
                        </ActionIcon>
                      ) : null
                    }
                  />

                  <ActionIcon
                    onClick={() => handleRemoveTable(selection.id)}
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
<<<<<<< HEAD

=======
>>>>>>> a3af25f5b (Auto-update Python transform function signature when table aliases change)
