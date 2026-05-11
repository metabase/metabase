import { t } from "ttag";

import { Box, Button, Stack, Text, Title } from "metabase/ui";
import type { Database } from "metabase-types/api";

import type { WorkspaceDatabaseInfo, WorkspaceInfo } from "../../../types";

import { DatabaseSection } from "./DatabaseSection";

export type DatabaseListSectionProps = {
  workspace: WorkspaceInfo;
  availableDatabases: Database[];
  onChangeDatabases: (databases: WorkspaceDatabaseInfo[]) => void;
};

export function DatabaseListSection({
  workspace,
  availableDatabases,
  onChangeDatabases,
}: DatabaseListSectionProps) {
  const { databases } = workspace;

  const handleDatabaseAdd = () => {
    const newDatabases = [...databases];
    newDatabases.push({ database_id: undefined, input: [] });
    onChangeDatabases(newDatabases);
  };

  const handleDatabaseChange = (
    newDatabase: WorkspaceDatabaseInfo,
    index: number,
  ) => {
    const newDatabases = [...databases];
    newDatabases[index] = newDatabase;
    onChangeDatabases(newDatabases);
  };

  const handleDatabaseRemove = (index: number) => {
    const newDatabases = [...databases];
    newDatabases.splice(index, 1);
    onChangeDatabases(newDatabases);
  };

  return (
    <Stack>
      <Stack gap="sm">
        <Title order={4}>{t`Databases to include`}</Title>
        <Text c="text-secondary">
          {t`The databases and schemas that should be accessible from this workspace`}
        </Text>
      </Stack>
      <Stack gap="md">
        {databases.map((database, index) => (
          <DatabaseSection
            key={index}
            database={database}
            availableDatabases={availableDatabases}
            canRemove={databases.length > 1}
            onDatabaseChange={(newDatabase) =>
              handleDatabaseChange(newDatabase, index)
            }
            onDatabaseRemove={() => handleDatabaseRemove(index)}
          />
        ))}
      </Stack>
      <Box>
        <Button onClick={handleDatabaseAdd}>
          {databases.length === 0 ? t`Add database` : t`Add another database`}
        </Button>
      </Box>
    </Stack>
  );
}
