import { useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery, useListTablesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Select, Stack, Text } from "metabase/ui";
import type { Database, Table } from "metabase-types/api";

type PythonDataPickerProps = {
  database?: number;
  table?: number;
  onChange: (database: number, table?: number) => void;
};

export function PythonDataPicker({
  database,
  table,
  onChange,
}: PythonDataPickerProps) {
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<
    number | undefined
  >(database);
  const [selectedTableId, setSelectedTableId] = useState<number | undefined>(
    table,
  );

  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databaseError,
  } = useListDatabasesQuery();

  const {
    data: tables,
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

  const tableOptions = (tables || [])
    .filter((tbl: Table) => tbl.db_id === selectedDatabaseId && tbl.active)
    .map((tbl: Table) => ({
      value: tbl.id.toString(),
      label: tbl.display_name || tbl.name,
    }));

  const handleDatabaseChange = (value: string | null) => {
    const dbId = value ? parseInt(value) : undefined;
    setSelectedDatabaseId(dbId);
    setSelectedTableId(undefined);
    if (dbId) {
      onChange(dbId, undefined);
    }
  };

  const handleTableChange = (value: string | null) => {
    const tblId = value ? parseInt(value) : undefined;
    setSelectedTableId(tblId);
    if (selectedDatabaseId) {
      onChange(selectedDatabaseId, tblId);
    }
  };

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
            {t`Source Table`}
          </Text>
          <Text size="xs" c="dimmed" mb="sm">
            {t`Select the table to use as the data source`}
          </Text>
          <Select
            data={tableOptions}
            value={selectedTableId?.toString() || null}
            onChange={handleTableChange}
            placeholder={t`Select a table`}
            clearable
            disabled={isLoadingTables}
          />
        </Box>
      )}
    </Stack>
  );
}
