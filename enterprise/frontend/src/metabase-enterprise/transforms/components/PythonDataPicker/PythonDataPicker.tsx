import { useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery, useListTablesQuery } from "metabase/api";
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
import type { Database, Table } from "metabase-types/api";

type TableSelection = {
  id: string; // unique ID for this selection row
  tableId: number | undefined;
  alias: string;
  aliasManuallySet?: boolean; // Track if user manually edited the alias
};

type PythonDataPickerProps = {
  database?: number;
  tables?: Record<string, number>; // alias -> table-id mapping
  onChange: (database: number, tables: Record<string, number>) => void;
};

// Helper function to slugify table names
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars
    .replace(/[\s_-]+/g, "_") // Replace spaces, underscores, hyphens with single underscore
    .replace(/^_+|_+$/g, ""); // Remove leading/trailing underscores
}

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

  // Helper to notify parent of changes
  const notifyParentOfChange = (
    dbId: number | undefined,
    selections: TableSelection[],
  ) => {
    if (dbId) {
      const tablesMap: Record<string, number> = {};
      selections.forEach((selection) => {
        if (selection.tableId && selection.alias) {
          tablesMap[selection.alias] = selection.tableId;
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

  const databases = databasesResponse?.data || [];
  const databaseOptions = databases.map((db: Database) => ({
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

  const handleDatabaseChange = (value: string | null) => {
    const dbId = value ? parseInt(value) : undefined;
    setSelectedDatabaseId(dbId);
    // Reset table selections when database changes
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

        // Generate new alias from table name
        const newAlias = table ? slugify(table.name) : "";

        return {
          ...selection,
          tableId,
          // Update alias unless user has manually set it
          alias: selection.aliasManuallySet ? selection.alias : newAlias,
          aliasManuallySet: selection.aliasManuallySet || false,
        };
      }
      return selection;
    });
    setTableSelections(newSelections);
    notifyParentOfChange(selectedDatabaseId, newSelections);
  };

  const handleAliasChange = (selectionId: string, alias: string) => {
    const newSelections = tableSelections.map((selection) =>
      selection.id === selectionId
        ? { ...selection, alias, aliasManuallySet: true }
        : selection,
    );
    setTableSelections(newSelections);
    notifyParentOfChange(selectedDatabaseId, newSelections);
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
    notifyParentOfChange(selectedDatabaseId, newSelections);
  };

  const selectedTableIds = new Set(
    tableSelections
      .filter((s) => s.tableId !== undefined)
      .map((s) => s.tableId?.toString()),
  );

  return (
    <Stack gap="md">
      <Box>
        <Text size="sm" fw="bold" mb="xs">
          {t`Source Database`}
        </Text>
        <Text size="xs" c="dimmed" mb="sm">
          {t`Select the database that contains your source data`}
        </Text>
        <Select
          data={databaseOptions}
          value={selectedDatabaseId?.toString() || null}
          onChange={handleDatabaseChange}
          placeholder={t`Select a database`}
          clearable
        />
      </Box>
      {selectedDatabaseId && (
        <Box>
          <Text size="sm" fw="bold" mb="xs">
            {t`Source Tables`}
          </Text>
          <Text size="xs" c="dimmed" mb="sm">
            {t`Select tables to use as data sources and provide aliases for each`}
          </Text>
          <Stack gap="sm">
            {tableSelections.map((selection, index) => (
              <Group key={selection.id} gap="sm" align="flex-end">
                <Select
                  style={{ flex: 1 }}
                  data={availableTables}
                  value={selection.tableId?.toString() || null}
                  onChange={(value) => handleTableChange(selection.id, value)}
                  placeholder={t`Select a table`}
                  clearable
                  disabled={isLoadingTables}
                />
                <TextInput
                  style={{ flex: 0.7 }}
                  value={selection.alias}
                  onChange={(e) =>
                    handleAliasChange(selection.id, e.target.value)
                  }
                  placeholder={t`Table alias`}
                  label={index === 0 ? t`Alias` : undefined}
                />
                {tableSelections.length > 1 && (
                  <ActionIcon
                    onClick={() => handleRemoveTable(selection.id)}
                    aria-label={t`Remove table`}
                    color="gray"
                    variant="subtle"
                  >
                    <Icon name="trash" />
                  </ActionIcon>
                )}
              </Group>
            ))}
            <Button
              leftSection={<Icon name="add" />}
              variant="subtle"
              onClick={handleAddTable}
              disabled={
                !tableSelections[tableSelections.length - 1]?.tableId ||
                availableTables.length === 0 ||
                selectedTableIds.size >= availableTables.length
              }
            >
              {t`Add another table`}
            </Button>
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

