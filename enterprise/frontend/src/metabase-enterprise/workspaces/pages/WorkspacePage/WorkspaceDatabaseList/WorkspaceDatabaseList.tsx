import { t } from "ttag";

import { Box, Stack, Text, Title } from "metabase/ui";
import type { Database, Workspace } from "metabase-types/api";

import { AddWorkspaceDatabaseButton } from "./AddWorkspaceDatabaseButton";
import { WorkspaceDatabaseEmptyState } from "./WorkspaceDatabaseEmptyState";
import { WorkspaceDatabaseSection } from "./WorkspaceDatabaseSection";
import { getSelectableDatabases } from "./utils";

export type WorkspaceDatabaseListProps = {
  workspace: Workspace;
  availableDatabases: Database[];
};

export function WorkspaceDatabaseList({
  workspace,
  availableDatabases,
}: WorkspaceDatabaseListProps) {
  const selectableDatabases = getSelectableDatabases(
    availableDatabases,
    workspace.databases,
  );
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
          availableDatabases={selectableDatabases}
        />
      ) : (
        <>
          <Stack gap="md">
            {workspace.databases.map((workspaceDatabase) => (
              <WorkspaceDatabaseSection
                key={workspaceDatabase.database_id}
                workspace={workspace}
                workspaceDatabase={workspaceDatabase}
                availableDatabases={availableDatabases}
              />
            ))}
          </Stack>
          <Box>
            <AddWorkspaceDatabaseButton
              workspace={workspace}
              availableDatabases={selectableDatabases}
            />
          </Box>
        </>
      )}
    </Stack>
  );
}
