import { t } from "ttag";

import { Box, Button, Stack, Text, Title } from "metabase/ui";
import type { Database } from "metabase-types/api";

import type { WorkspaceDatabaseInfo } from "../../types";

import { DatabaseSection } from "./DatabaseSection";

export type DatabaseEditorProps = {
  workspaceDatabases: WorkspaceDatabaseInfo[];
  availableDatabases: Database[];
  onDatabasesChange: (workspaceDatabases: WorkspaceDatabaseInfo[]) => void;
};

export function DatabaseEditor({
  workspaceDatabases,
  availableDatabases,
  onDatabasesChange,
}: DatabaseEditorProps) {
  const handleDatabaseAdd = () => {
    const newWorkspaceDatabases = [...workspaceDatabases];
    newWorkspaceDatabases.push({ database_id: undefined, input: [] });
    onDatabasesChange(newWorkspaceDatabases);
  };

  const handleDatabaseChange = (
    newWorkspaceDatabase: WorkspaceDatabaseInfo,
    index: number,
  ) => {
    const newWorkspaceDatabases = [...workspaceDatabases];
    newWorkspaceDatabases[index] = newWorkspaceDatabase;
    onDatabasesChange(newWorkspaceDatabases);
  };

  const handleDatabaseRemove = (index: number) => {
    const newWorkspaceDatabases = [...workspaceDatabases];
    newWorkspaceDatabases.splice(index, 1);
    onDatabasesChange(newWorkspaceDatabases);
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
        {workspaceDatabases.map((workspaceDatabase, index) => (
          <DatabaseSection
            key={index}
            workspaceDatabase={workspaceDatabase}
            availableDatabases={availableDatabases}
            canRemove={workspaceDatabases.length > 1}
            onDatabaseChange={(newWorkspaceDatabase) =>
              handleDatabaseChange(newWorkspaceDatabase, index)
            }
            onDatabaseRemove={() => handleDatabaseRemove(index)}
          />
        ))}
      </Stack>
      <Box>
        <Button onClick={handleDatabaseAdd}>
          {workspaceDatabases.length === 0
            ? t`Add database`
            : t`Add another database`}
        </Button>
      </Box>
    </Stack>
  );
}
