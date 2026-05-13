import { t } from "ttag";

import { Box, Stack, Text, Title } from "metabase/ui";
import type { Database, Workspace } from "metabase-types/api";

import { getDatabasesById } from "../../../utils";

import { AddWorkspaceDatabaseButton } from "./AddWorkspaceDatabaseButton";
import { WorkspaceDatabaseEmptyState } from "./WorkspaceDatabaseEmptyState";
import { WorkspaceDatabaseSection } from "./WorkspaceDatabaseSection";

export type WorkspaceDatabaseListProps = {
  workspace: Workspace;
  availableDatabases: Database[];
};

export function WorkspaceDatabaseList({
  workspace,
  availableDatabases,
}: WorkspaceDatabaseListProps) {
  const databaseById = getDatabasesById(availableDatabases);
  const isEmpty = workspace.databases.length === 0;

  return (
    <Stack>
      <Stack gap="sm">
        <Title order={4}>{t`Databases to include`}</Title>
        <Text c="text-secondary">
          {t`The databases and schemas that should be accessible from this workspace`}
        </Text>
      </Stack>
      {isEmpty ? (
        <WorkspaceDatabaseEmptyState
          workspace={workspace}
          availableDatabases={availableDatabases}
        />
      ) : (
        <>
          <Stack gap="md">
            {workspace.databases.map((workspaceDatabase) => (
              <WorkspaceDatabaseSection
                key={workspaceDatabase.database_id}
                workspace={workspace}
                workspaceDatabase={workspaceDatabase}
                database={databaseById.get(workspaceDatabase.database_id)}
              />
            ))}
          </Stack>
          <Box>
            <AddWorkspaceDatabaseButton
              workspace={workspace}
              availableDatabases={availableDatabases}
            />
          </Box>
        </>
      )}
    </Stack>
  );
}
