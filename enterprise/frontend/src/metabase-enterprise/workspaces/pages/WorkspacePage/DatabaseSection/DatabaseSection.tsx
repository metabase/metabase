import { t } from "ttag";

import { Box, Stack, Text, Title } from "metabase/ui";
import type { Database, Workspace } from "metabase-types/api";

import { getDatabasesById } from "../../../utils";

import { AddDatabaseButton } from "./AddDatabaseButton";
import { DatabaseEmptyState } from "./DatabaseEmptyState";
import { DatabaseItem } from "./DatabaseItem";

export type DatabaseSectionProps = {
  workspace: Workspace;
  availableDatabases: Database[];
};

export function DatabaseSection({
  workspace,
  availableDatabases,
}: DatabaseSectionProps) {
  const databaseById = getDatabasesById(availableDatabases);
  const isEmpty = workspace.databases.length === 0;

  return (
    <Stack data-testid="workspace-database-section">
      <Stack gap="sm">
        <Title order={4}>{t`Databases to include`}</Title>
        <Text c="text-secondary">
          {t`The databases and schemas that should be accessible from this workspace`}
        </Text>
      </Stack>
      {isEmpty ? (
        <DatabaseEmptyState
          workspace={workspace}
          availableDatabases={availableDatabases}
        />
      ) : (
        <>
          <Stack gap="md">
            {workspace.databases.map((workspaceDatabase) => (
              <DatabaseItem
                key={workspaceDatabase.database_id}
                workspace={workspace}
                workspaceDatabase={workspaceDatabase}
                database={databaseById.get(workspaceDatabase.database_id)}
              />
            ))}
          </Stack>
          <Box>
            <AddDatabaseButton
              workspace={workspace}
              availableDatabases={availableDatabases}
            />
          </Box>
        </>
      )}
    </Stack>
  );
}
