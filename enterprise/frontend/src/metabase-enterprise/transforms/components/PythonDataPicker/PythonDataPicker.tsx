import { useState } from "react";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Select, Stack, Text } from "metabase/ui";
import type { Database } from "metabase-types/api";

type PythonDataPickerProps = {
  database?: number;
  onChange: (database: number, table?: number) => void;
};

export function PythonDataPicker({
  database,
  onChange,
}: PythonDataPickerProps) {
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<
    number | undefined
  >(database);

  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databaseError,
  } = useListDatabasesQuery();

  if (databaseError) {
    return <LoadingAndErrorWrapper error={databaseError} />;
  }

  if (isLoadingDatabases) {
    return <LoadingAndErrorWrapper loading />;
  }

  const databases = databasesResponse?.data || [];
  const databaseOptions = databases.map((db: Database) => ({
    value: db.id.toString(),
    label: db.name,
  }));

  const handleDatabaseChange = (value: string | null) => {
    const dbId = value ? parseInt(value) : undefined;
    setSelectedDatabaseId(dbId);
    if (dbId) {
      onChange(dbId, undefined); // Clear table selection when database changes
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
    </Stack>
  );
}
